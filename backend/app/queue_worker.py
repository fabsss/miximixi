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
    extract_frame_at_timestamp,
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


async def process_job(job: dict) -> None:
    """Verarbeitet einen einzelnen Import-Job."""
    queue_id = job["id"]
    source_url = job["source_url"]
    source_type = job.get("source_type", "telegram")
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

        if not media_paths:
            raise ValueError(f"Keine Medien herunterladbar: {source_url}")

        # 2. Medien für LLM vorbereiten
        if settings.llm_provider == "gemini":
            llm_media = prepare_media_for_gemini(media_paths)
        else:
            llm_media = prepare_media_for_frames(media_paths, tmp_job_dir)

        if not llm_media:
            raise ValueError("Keine verwertbaren Medien nach Verarbeitung")

        # 3. LLM-Extraktion
        extraction = llm.extract_recipe(llm_media, raw_source_text)
        recipe_data = extraction.recipe
        logger.info(f"Rezept extrahiert: '{recipe_data.title}'")

        # 4. Titelbild extrahieren und speichern
        recipe_id = str(uuid.uuid4())
        image_filename: Optional[str] = None
        extraction_status = "success"

        cover_path = _resolve_cover(extraction, media_paths, llm_media, tmp_job_dir)
        if cover_path:
            try:
                image_filename = save_cover_to_storage(cover_path, recipe_id)
            except Exception as e:
                logger.warning(f"Titelbild-Speicherung fehlgeschlagen: {e}")
                extraction_status = "partial"
        else:
            logger.info("Kein Titelbild – image_filename bleibt NULL")
            extraction_status = "partial"

        # 5. Rezept in der Datenbank speichern
        cursor.execute(
            """
            INSERT INTO recipes (
                id, title, lang, category, servings, prep_time, cook_time, tags,
                image_filename, source_url, source_label, raw_source_text,
                llm_provider_used, extraction_status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                raw_source_text or None,
                settings.llm_provider,
                extraction_status,
            ),
        )

        # 6. Zutaten speichern
        if recipe_data.ingredients:
            for ing in recipe_data.ingredients:
                cursor.execute(
                    """
                    INSERT INTO ingredients (recipe_id, sort_order, name, amount, unit, group_name)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (recipe_id, ing.id, ing.name, ing.amount, ing.unit, ing.group_name),
                )

        # 7. Schritte speichern
        if recipe_data.steps:
            for step in recipe_data.steps:
                cursor.execute(
                    """
                    INSERT INTO steps (recipe_id, sort_order, text, time_minutes)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (recipe_id, step.id, step.text, step.time_minutes),
                )

        # 8. Import-Queue-Status auf "done" setzen
        cursor.execute(
            "UPDATE import_queue SET status = %s, recipe_id = %s WHERE id = %s",
            ("done", recipe_id, queue_id),
        )
        db.commit()

        logger.info(
            f"Job {queue_id} ✓  recipe_id={recipe_id}  status={extraction_status}"
        )

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
                cover = extract_frame_at_timestamp(path, extraction.cover_timestamp, tmp_dir)
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


async def run_worker(poll_interval: int = 5) -> None:
    """Startet die Background-Worker-Loop."""
    logger.info(f"Queue-Worker gestartet (provider={settings.llm_provider}, poll={poll_interval}s)")

    while True:
        try:
            db = get_db_connection()
            cursor = db.cursor(cursor_factory=RealDictCursor)

            cursor.execute(
                "SELECT * FROM import_queue WHERE status = %s ORDER BY created_at LIMIT 1",
                ("pending",),
            )
            result = cursor.fetchone()
            db.close()

            if result:
                await process_job(dict(result))
            else:
                await asyncio.sleep(poll_interval)
        except Exception as e:
            logger.exception(f"Worker-Fehler: {e}")
            await asyncio.sleep(poll_interval)
