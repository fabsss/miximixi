"""
Instagram Collection Poller via instaloader.
Authentifizierung via cookies.txt (sessionid Cookie) – kein programmatischer Login nötig.
"""
import logging
import os
from http.cookiejar import MozillaCookieJar
from pathlib import Path

import instaloader

from app.config import settings
from app.instagram_auth import is_cookie_valid

logger = logging.getLogger(__name__)


def _get_loader():
    """
    Erstellt einen authentifizierten instaloader-Client via sessionid aus cookies.txt.
    Wirft ValueError wenn die Cookies-Datei fehlt oder keinen sessionid-Eintrag hat.
    """
    cookies_file = settings.instagram_cookies_file
    if not os.path.exists(cookies_file):
        raise ValueError(
            f"Keine Cookies-Datei gefunden: {cookies_file}. "
            "Bitte cookies.txt aus dem Browser exportieren (z.B. via 'Get cookies.txt LOCALLY')."
        )

    if not is_cookie_valid(threshold_days=settings.instagram_cookie_refresh_threshold_days):
        logger.warning(
            "Instagram-Cookies sind abgelaufen oder laufen bald ab. "
            "Automatischer Refresh wird vom Sync-Worker ausgelöst."
        )

    # sessionid aus cookies.txt extrahieren
    jar = MozillaCookieJar(cookies_file)
    jar.load(ignore_discard=True, ignore_expires=True)
    session_id = next(
        (c.value for c in jar if c.name == "sessionid" and "instagram.com" in c.domain),
        None,
    )
    if not session_id:
        raise ValueError("Kein 'sessionid' Cookie in der Cookies-Datei gefunden.")

    L = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        quiet=True,
    )

    # Session direkt via sessionid setzen – kein Login-Request
    L.context._session.cookies.set("sessionid", session_id, domain=".instagram.com")
    L.context.username = settings.instagram_username or "unknown"

    return L


def get_collection_media_urls(limit: int = 20) -> list[dict]:
    """
    Gibt die neuesten URLs aus der konfigurierten Instagram Saved Collection zurück.
    Benötigt INSTAGRAM_COLLECTION_ID in der .env.
    """
    if not settings.instagram_collection_id:
        raise ValueError("INSTAGRAM_COLLECTION_ID nicht konfiguriert")

    L = _get_loader()

    collection = instaloader.Collection(L.context, int(settings.instagram_collection_id))

    result = []
    for post in collection.get_posts():
        if len(result) >= limit:
            break
        url = f"https://www.instagram.com/p/{post.shortcode}/"
        result.append({
            "url": url,
            "caption": post.caption or "",
            "source_label": f"@{post.owner_username}",
        })

    logger.info(f"Instagram Collection: {len(result)} Medien gefunden")
    return result
