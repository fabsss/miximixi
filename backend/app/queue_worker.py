"""
Queue-Worker: Verarbeitet pending Import-Jobs aus der import_queue.
Läuft als Background-Task im FastAPI-Prozess.

Verarbeitungs-Pfade:
  Gemini  → Video nativ → 1 API-Call → Rezept + cover_timestamp → ffmpeg Frame
  Andere  → ffmpeg 5 Frames → LLM → Rezept + cover_frame_index → Frame als Cover

Fallback-Kaskade:
  LLM-Fehler → raw_source_text bleibt erhalten → extraction_status = 'needs_review'
  Kein Foto  → image_filename = NULL            → extraction_status = 'partial'
"""
import asyncio
import logging
import os
import shutil
import uuid
from typing import Optional

import httpx
import psycopg2
from psycopg2.extras import RealDictCursor

from app.config import settings
from app.llm_provider import LLMProvider
from app.media_processor import (
    DownloadResult,
    download_media,
    download_website,
    extract_cover_frame,
    extract_cover_frame_at_timestamp,
    extract_frame_at_timestamp,
    is_video,
    prepare_media_for_frames,
    prepare_media_for_gemini,
    save_cover_to_storage,
)

logger = logging.getLogger(__name__)
llm = LLMProvider()


def get_db_connection():
    """Erstellt eine PostgreSQL-Verbindung."""
    return psycopg2.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
    )


def _save_recipe_to_db(
    recipe_id: str,
    recipe_data,
    image_filename: Optional[str],
    source_url: str,
    raw_source_text: str,
    extraction_status: str,
    queue_id: str,
) -> None:
    """
    Speichert Rezept + Zutaten + Schritte in der Datenbank.
    Läuft im Thread Pool via asyncio.to_thread() — blockierend!
    """
    db = get_db_connection()
    cursor = db.cursor()

    try:
        # 1. Insert Recipe
        cursor.execute(
            """
            INSERT INTO recipes (id, title, lang, category, servings, prep_time, cook_time, tags, image_filename, source_url, source_label, raw_source_text, llm_provider_used, extraction_status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                recipe_id,
                recipe_data.title,
                recipe_data.lang,
                recipe_data.category,
                recipe_data.servings,
                recipe_data.prep_time,
                recipe_data.cook_time,
                recipe_data.tags,
                image_filename,
                source_url,
                _extract_source_label(source_url),
                raw_source_text,
                settings.llm_provider,
                extraction_status,
            ),
        )

        # 2. Insert Ingredients
        for ingredient in recipe_data.ingredients:
            cursor.execute(
                """
                INSERT INTO ingredients (recipe_id, sort_order, name, amount, unit)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    recipe_id,
                    ingredient.id,
                    ingredient.name,
                    ingredient.amount,
                    ingredient.unit,
                ),
            )

        # 3. Insert Steps
        for step in recipe_data.steps:
            cursor.execute(
                """
                INSERT INTO steps (recipe_id, sort_order, text, time_minutes)
                VALUES (%s, %s, %s, %s)
                """,
                (
                    recipe_id,
                    step.id,
                    step.text,
                    step.time_minutes,
                ),
            )

        # 4. Update import_queue: set status to 'done' and link recipe_id
        cursor.execute(
            """
            UPDATE import_queue
            SET status = %s, recipe_id = %s, updated_at = now()
            WHERE id = %s
            """,
            ("done", recipe_id, queue_id),
        )

        db.commit()
        logger.info(f"Rezept {recipe_id} erfolgreich in DB gespeichert")

    except Exception as e:
        db.rollback()
        logger.exception(f"Fehler beim Speichern in DB: {e}")
        raise

    finally:
        db.close()


async def process_job(job: dict, notify_callback=None) -> None:
    """
    Verarbeitet einen einzelnen Import-Job.
    
    Args:
        job: Job dict from import_queue table
        notify_callback: Optional async function to notify user (telegram_chat_id, success, recipe_title, error_msg)
    """
    queue_id = job["id"]
    source_url = job["source_url"]
    source_type = job.get("source_type", "telegram")
    telegram_chat_id = job.get("telegram_chat_id")
    tmp_job_dir = os.path.join(settings.tmp_dir, queue_id)
    db = None

    try:
        db = get_db_connection()
        cursor = db.cursor()

        # Job-Status auf "processing" setzen
        cursor.execute(
            "UPDATE import_queue SET status = %s, llm_provider_used = %s WHERE id = %s",
            ("processing", settings.llm_provider, queue_id),
        )
        db.commit()
        logger.info(f"Verarbeite Job {queue_id}: {source_url}")

        # 1. Medien herunterladen
        download = await _download_for_source(source_url, source_type, tmp_job_dir)

        raw_source_text = job.get("caption") or download.description or ""
        media_paths = download.media_paths

        # If no media found, check if we have caption/description for fallback
        if not media_paths and not raw_source_text:
            raise ValueError(f"Keine Medien und keine Caption verfügbar: {source_url}")

        if not media_paths:
            logger.info(f"Kein Video/Bild herunterladbar, verwende nur Caption/Beschreibung")

        # 2. Medien für LLM vorbereiten (läuft im Thread Pool, um AsyncIO Event Loop nicht zu blockieren)
        llm_media = []
        if media_paths:
            if settings.llm_provider == "gemini":
                llm_media = await asyncio.to_thread(prepare_media_for_gemini, media_paths)
            else:
                llm_media = await asyncio.to_thread(prepare_media_for_frames, media_paths, tmp_job_dir)

        # Allow extraction with caption only if no media available
        if not llm_media and not raw_source_text:
            raise ValueError("Keine Medien und keine Caption/Beschreibung zum Extrahieren verfügbar")

        if not llm_media:
            logger.info("Keine verwertbaren Medien – versuche Rezept aus Caption/Text zu extrahieren")

        # 3. LLM-Extraktion (blockierend - läuft im Thread Pool)
        logger.info(f"Starte LLM-Extraktion (im Thread Pool)...")
        extraction = await asyncio.to_thread(llm.extract_recipe, llm_media, raw_source_text)
        recipe_data = extraction.recipe
        logger.info(f"Rezept extrahiert: '{recipe_data.title}'")

        # Recipe ID früh generieren (wird für Step-Frame-Namen benötigt)
        recipe_id = str(uuid.uuid4())

        # 3b. Step-Frame-Extraktion (für wichtige Arbeitsschritte, läuft im Thread Pool)
        if recipe_data.steps and media_paths and any(is_video(p) for p in media_paths):
            video_path = next((p for p in media_paths if is_video(p)), None)
            if video_path:
                for step in recipe_data.steps:
                    if step.step_timestamp:
                        try:
                            step_image_filename = await asyncio.to_thread(
                                extract_frame_at_timestamp,
                                video_path,
                                step.step_timestamp,
                                recipe_id,
                                step.id
                            )
                            step.step_image_filename = step_image_filename
                            if step_image_filename:
                                logger.info(f"Step {step.id} Frame extrahiert: {step_image_filename}")
                        except Exception as e:
                            logger.warning(f"Step {step.id} Frame-Extraktion fehlgeschlagen: {e}")

        # 4. Titelbild extrahieren und speichern
        image_filename: Optional[str] = None
        extraction_status = "success"

        cover_path = await asyncio.to_thread(_resolve_cover, extraction, media_paths, llm_media, tmp_job_dir)
        if cover_path:
            try:
                image_filename = await asyncio.to_thread(save_cover_to_storage, cover_path, recipe_id)
            except Exception as e:
                logger.warning(f"Titelbild-Speicherung fehlgeschlagen: {e}")
                extraction_status = "partial"
        else:
            logger.info("Kein Titelbild – image_filename bleibt NULL")
            extraction_status = "partial"

        # 5-8. Speichere Rezept + Zutaten + Schritte in der Datenbank (läuft im Thread Pool)
        await asyncio.to_thread(
            _save_recipe_to_db,
            recipe_id,
            recipe_data,
            image_filename,
            source_url,
            raw_source_text,
            extraction_status,
            queue_id,
        )

        logger.info(
            f"Job {queue_id} ✓  recipe_id={recipe_id}  status={extraction_status}"
        )

        # 9. User-Benachrichtigung (telegram_chat_id) senden
        if notify_callback and telegram_chat_id:
            try:
                await notify_callback(
                    chat_id=telegram_chat_id,
                    success=True,
                    recipe_title=recipe_data.title,
                )
                # Null the chat_id after notification (privacy-first)
                cursor = db.cursor()
                cursor.execute(
                    "UPDATE import_queue SET telegram_chat_id = NULL WHERE id = %s",
                    (queue_id,),
                )
                db.commit()
                logger.info(f"Notification sent for {queue_id}, chat_id nulled")
            except Exception as notify_err:
                logger.warning(f"Notification failed for {queue_id}: {notify_err}")

    except Exception as e:
        logger.exception(f"Fehler bei Job {queue_id}: {e}")
        if db:
            try:
                cursor = db.cursor()
                cursor.execute(
                    "UPDATE import_queue SET status = %s, error_msg = %s WHERE id = %s",
                    ("needs_review", str(e)[:1000], queue_id),
                )
                db.commit()
            except Exception as db_err:
                logger.warning(f"Fehler beim Update der import_queue: {db_err}")
        
        # User notification for errors
        if notify_callback and telegram_chat_id:
            try:
                await notify_callback(
                    chat_id=telegram_chat_id,
                    success=False,
                    error_msg=str(e),
                )
                # Null the chat_id after notification
                cursor = db.cursor()
                cursor.execute(
                    "UPDATE import_queue SET telegram_chat_id = NULL WHERE id = %s",
                    (queue_id,),
                )
                db.commit()
            except Exception as notify_err:
                logger.warning(f"Error notification failed: {notify_err}")
        
        await _notify_needs_review(source_url, str(e))

    finally:
        if db:
            db.close()
        if os.path.exists(tmp_job_dir):
            shutil.rmtree(tmp_job_dir, ignore_errors=True)


async def _download_for_source(
    url: str, source_type: str, output_dir: str
) -> DownloadResult:
    """Routing je nach Quell-Typ."""
    if source_type == "web":
        logger.info(f"Website-Download via Playwright: {url}")
        return await download_website(url, output_dir)
    else:
        logger.info(f"Medien-Download via yt-dlp ({source_type}): {url}")
        return await download_media(url, output_dir)


def _resolve_cover(
    extraction,
    media_paths: list[str],
    llm_media: list[str],
    tmp_dir: str,
) -> Optional[str]:
    """
    Ermittelt den Cover-Frame basierend auf dem LLM-Ergebnis.
    """
    from app.media_processor import is_video

    # Gemini: Timestamp → Frame extrahieren
    if extraction.cover_timestamp:
        for path in media_paths:
            if is_video(path):
                cover = extract_cover_frame_at_timestamp(path, extraction.cover_timestamp, tmp_dir)
                if cover:
                    logger.info(f"Cover via Timestamp {extraction.cover_timestamp}: {cover}")
                    return cover

    # Andere Provider: Frame-Index aus der llm_media-Liste
    if extraction.cover_frame_index is not None:
        idx = extraction.cover_frame_index
        if 0 <= idx < len(llm_media):
            logger.info(f"Cover via Frame-Index {idx}: {llm_media[idx]}")
            return llm_media[idx]

    # Fallback: Mittlerer Frame
    logger.info("Kein Cover-Hint vom LLM – Fallback auf mittleren Frame")
    return extract_cover_frame(media_paths, tmp_dir)


def _extract_source_label(url: str) -> str:
    """Extrahiert einen kurzen Label aus der URL."""
    import re

    match = re.search(r"instagram\.com/([^/?#]+)", url)
    if match:
        username = match.group(1)
        if username not in ("p", "reel", "tv"):
            return f"@{username}"
    match = re.search(r"youtube\.com/@?([^/?#]+)", url)
    if match:
        return f"@{match.group(1)}"
    match = re.search(r"youtu\.be/", url)
    if match:
        return "YouTube"
    try:
        from urllib.parse import urlparse

        return urlparse(url).netloc
    except Exception:
        return ""


async def _notify_needs_review(source_url: str, error: str) -> None:
    """Schickt eine Telegram-Benachrichtigung bei Fehler."""
    if not settings.telegram_bot_token or not settings.telegram_notify_chat_id:
        return

    short_url = source_url[:80] + "…" if len(source_url) > 80 else source_url
    short_err = error[:200] + "…" if len(error) > 200 else error
    text = (
        f"⚠️ *Rezept konnte nicht extrahiert werden*\n\n"
        f"🔗 {short_url}\n"
        f"❌ `{short_err}`\n\n"
        f"Bitte manuell in der App prüfen und ergänzen."
    )

    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
                json={
                    "chat_id": settings.telegram_notify_chat_id,
                    "text": text,
                    "parse_mode": "Markdown",
                },
                timeout=10.0,
            )
        logger.info(f"Telegram needs_review Benachrichtigung gesendet: {source_url}")
    except Exception as e:
        logger.warning(f"Telegram-Benachrichtigung fehlgeschlagen: {e}")


def _claim_next_pending_job() -> Optional[dict]:
    """
    Claims the next pending job atomically using FOR UPDATE SKIP LOCKED.
    Sets status to 'processing' inside the transaction.
    Returns the job dict or None if no pending jobs.
    """
    db = get_db_connection()
    cursor = db.cursor(cursor_factory=RealDictCursor)
    
    try:
        # Atomically claim the next job
        cursor.execute(
            """
            UPDATE import_queue
            SET status = %s
            WHERE id = (
                SELECT id FROM import_queue
                WHERE status = %s
                ORDER BY created_at
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING *
            """,
            ("processing", "pending")
        )
        job = cursor.fetchone()
        db.commit()
        return dict(job) if job else None
    except Exception as e:
        logger.warning(f"Error claiming job: {e}")
        db.rollback()
        return None
    finally:
        db.close()


async def run_worker(
    poll_interval: int = 5,
    notify_callback=None,
) -> None:
    """
    Starts the Background-Worker-Loop with parallel job processing.
    
    Args:
        poll_interval: How often to check for new jobs (seconds)
        notify_callback: Optional async function to notify users
    """
    max_concurrent = settings.worker_max_concurrent
    semaphore = asyncio.Semaphore(max_concurrent)
    
    logger.info(
        f"Queue-Worker gestartet (provider={settings.llm_provider}, "
        f"max_concurrent={max_concurrent}, poll={poll_interval}s)"
    )

    async def _process_with_semaphore(job: dict) -> None:
        """Wraps process_job with semaphore to limit concurrency."""
        async with semaphore:
            await process_job(job, notify_callback)

    while True:
        try:
            # Claim up to max_concurrent jobs
            jobs = []
            for _ in range(max_concurrent):
                job = _claim_next_pending_job()
                if job:
                    jobs.append(job)
                else:
                    break
            
            if jobs:
                # Process all jobs concurrently (semaphore limits to max_concurrent)
                tasks = [_process_with_semaphore(job) for job in jobs]
                await asyncio.gather(*tasks, return_exceptions=True)
            else:
                # No jobs — wait before polling again
                await asyncio.sleep(poll_interval)
        except Exception as e:
            logger.exception(f"Worker-Fehler: {e}")
            await asyncio.sleep(poll_interval)
