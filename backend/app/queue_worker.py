"""
Queue-Worker: Verarbeitet pending Import-Jobs aus der import_queue.
Läuft als Background-Task im FastAPI-Prozess.

Verarbeitungs-Pfade:
  Gemini  → Video nativ → 1 API-Call → Rezept + cover_timestamp → ffmpeg Frame
  Andere  → ffmpeg 5 Frames → LLM → Rezept + cover_frame_index → Frame als Cover

Fallback-Kaskade:
  LLM-Fehler → raw_source_text bleibt erhalten → extraction_status = 'needs_review'
  Kein Foto  → image_url = NULL              → extraction_status = 'partial'
"""
import asyncio
import logging
import os
import shutil
import uuid

import httpx

from supabase import create_client

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
    upload_cover_to_storage,
)

logger = logging.getLogger(__name__)
llm = LLMProvider()


def get_supabase():
    return create_client(settings.supabase_url, settings.supabase_service_key)


async def process_job(job: dict) -> None:
    queue_id = job["id"]
    source_url = job["source_url"]
    source_type = job.get("source_type", "telegram")
    tmp_job_dir = os.path.join(settings.tmp_dir, queue_id)
    supabase = get_supabase()

    try:
        supabase.table("import_queue").update({
            "status": "processing",
            "llm_provider_used": settings.llm_provider,
        }).eq("id", queue_id).execute()
        logger.info(f"Verarbeite Job {queue_id}: {source_url}")

        # 1. Medien herunterladen – Pfad je nach source_type
        download = await _download_for_source(source_url, source_type, tmp_job_dir)

        # Caption aus dem Job hat Vorrang (von n8n mitgeschickt),
        # sonst Beschreibung aus dem Download (YouTube / Website)
        raw_source_text = job.get("caption") or download.description or ""
        media_paths = download.media_paths

        if not media_paths:
            raise ValueError(f"Keine Medien herunterladbar: {source_url}")

        # 2. Medien für LLM vorbereiten – Pfad je nach Provider
        if settings.llm_provider == "gemini":
            llm_media = prepare_media_for_gemini(media_paths)
        else:
            llm_media = prepare_media_for_frames(media_paths, tmp_job_dir)

        if not llm_media:
            raise ValueError("Keine verwertbaren Medien nach Verarbeitung")

        # 3. LLM-Extraktion: Rezept + Foto-Hint in einem Call
        extraction = llm.extract_recipe(llm_media, raw_source_text)
        recipe_data = extraction.recipe
        logger.info(f"Rezept extrahiert: '{recipe_data.title}'")

        # 4. Titelbild aus Video extrahieren
        recipe_id = str(uuid.uuid4())
        image_url: str | None = None
        extraction_status = "success"

        cover_path = _resolve_cover(extraction, media_paths, llm_media, tmp_job_dir)
        if cover_path:
            try:
                image_url = upload_cover_to_storage(cover_path, recipe_id)
            except Exception as e:
                logger.warning(f"Titelbild-Upload fehlgeschlagen: {e}")
                extraction_status = "partial"
        else:
            logger.info("Kein Titelbild – image_url bleibt NULL")
            extraction_status = "partial"

        # 5. Rezept in Supabase speichern
        supabase.table("recipes").insert({
            "id": recipe_id,
            "title": recipe_data.title,
            "lang": recipe_data.lang,
            "category": recipe_data.category,
            "servings": recipe_data.servings,
            "prep_time": recipe_data.prep_time,
            "cook_time": recipe_data.cook_time,
            "tags": recipe_data.tags,
            "image_url": image_url,
            "source_url": source_url,
            "source_label": source_url,
            "raw_source_text": raw_source_text or None,
            "llm_provider_used": settings.llm_provider,
            "extraction_status": extraction_status,
        }).execute()

        if recipe_data.ingredients:
            supabase.table("ingredients").insert([
                {
                    "recipe_id": recipe_id,
                    "sort_order": ing.id,
                    "name": ing.name,
                    "amount": ing.amount,
                    "unit": ing.unit,
                    "group_name": ing.group_name,
                }
                for ing in recipe_data.ingredients
            ]).execute()

        if recipe_data.steps:
            supabase.table("steps").insert([
                {
                    "recipe_id": recipe_id,
                    "sort_order": step.id,
                    "text": step.text,
                    "time_minutes": step.time_minutes,
                }
                for step in recipe_data.steps
            ]).execute()

        supabase.table("import_queue").update({
            "status": "done",
            "recipe_id": recipe_id,
        }).eq("id", queue_id).execute()

        logger.info(f"Job {queue_id} ✓  recipe_id={recipe_id}  status={extraction_status}")

    except Exception as e:
        logger.exception(f"Fehler bei Job {queue_id}: {e}")
        supabase.table("import_queue").update({
            "status": "needs_review",
            "error_msg": str(e)[:1000],
        }).eq("id", queue_id).execute()
        await _notify_needs_review(source_url, str(e))

    finally:
        if os.path.exists(tmp_job_dir):
            shutil.rmtree(tmp_job_dir, ignore_errors=True)


async def _download_for_source(url: str, source_type: str, output_dir: str) -> DownloadResult:
    """
    Routing je nach Quell-Typ:
      instagram              → instagrapi (authentifiziert, kein Cookie-Hack)
      youtube / telegram     → yt-dlp
      web                    → Playwright (Screenshot + HTML-Text)
    """
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
) -> str | None:
    """
    Ermittelt den Cover-Frame basierend auf dem LLM-Ergebnis:

    Gemini-Pfad:  extraction.cover_timestamp → ffmpeg Frame bei diesem Timestamp
    Andere:       extraction.cover_frame_index → Frame aus der bereits extrahierten Liste
    Fallback:     Mittlerer Frame (wenn LLM keinen Hint geliefert hat)
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
    """
    Schickt eine Telegram-Benachrichtigung wenn ein Import manuell überprüft werden muss.
    Kein Fehler wenn Telegram nicht konfiguriert ist.
    """
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
        logger.warning(f"Telegram-Benachrichtigung fehlgeschlagen (kein Blocker): {e}")


async def run_worker(poll_interval: int = 5) -> None:
    logger.info(f"Queue-Worker gestartet (provider={settings.llm_provider}, poll={poll_interval}s)")
    supabase = get_supabase()

    while True:
        try:
            result = (
                supabase.table("import_queue")
                .select("*")
                .eq("status", "pending")
                .order("created_at")
                .limit(1)
                .execute()
            )
            if result.data:
                await process_job(result.data[0])
            else:
                await asyncio.sleep(poll_interval)
        except Exception as e:
            logger.exception(f"Worker-Fehler: {e}")
            await asyncio.sleep(poll_interval)
