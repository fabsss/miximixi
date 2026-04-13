"""
Instagram Collection Poller via instagrapi.
Wird von n8n per HTTP-Request ausgelöst (alle 15 Min).
"""
import json
import logging
import os
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)


def get_client():
    """Erstellt instagrapi-Client mit gecachter Session."""
    from instagrapi import Client

    cl = Client()
    session_file = settings.instagram_session_file

    if os.path.exists(session_file):
        try:
            cl.load_settings(session_file)
            cl.login(settings.instagram_username, settings.instagram_password)
            logger.info("Instagram: Session aus Cache geladen")
            return cl
        except Exception as e:
            logger.warning(f"Session-Cache ungültig, neu einloggen: {e}")

    cl.login(settings.instagram_username, settings.instagram_password)
    cl.dump_settings(session_file)
    logger.info("Instagram: Neu eingeloggt, Session gecacht")
    return cl


def get_collection_media_urls(limit: int = 20) -> list[dict]:
    """
    Gibt die neuesten URLs aus der konfigurierten Instagram Saved Collection zurück.
    """
    if not settings.instagram_collection_id:
        raise ValueError("INSTAGRAM_COLLECTION_ID nicht konfiguriert")

    cl = get_client()

    medias = cl.collection_medias(
        settings.instagram_collection_id,
        amount=limit,
    )

    result = []
    for media in medias:
        url = f"https://www.instagram.com/p/{media.code}/"
        caption = media.caption_text or ""
        username = media.user.username if media.user else ""
        result.append({
            "url": url,
            "caption": caption,
            "source_label": f"@{username}",
        })

    logger.info(f"Instagram Collection: {len(result)} Medien gefunden")
    return result
