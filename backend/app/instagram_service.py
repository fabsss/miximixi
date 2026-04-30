"""
Instagram Collection Poller via instaloader.
Authentifizierung via gespeicherter instaloader Session-Datei pro Account.
"""
import logging
import os

import instaloader

from app.config import settings

logger = logging.getLogger(__name__)


def _get_session_file(account_id: str = "default") -> str:
    username = settings.instagram_username or account_id
    return os.path.join(settings.instagram_browser_state_dir, f"session-{username}")


def _get_loader(account_id: str = "default") -> instaloader.Instaloader:
    """
    Erstellt einen authentifizierten instaloader-Client via gespeicherter Session-Datei.
    Wirft ValueError wenn keine Session-Datei vorhanden ist.
    """
    session_file = _get_session_file(account_id)

    if not os.path.exists(session_file):
        raise ValueError(
            f"Keine instaloader Session gefunden für Account '{account_id}'. "
            "Bitte /refresh_cookies ausführen um die Session zu erneuern."
        )

    L = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        quiet=True,
    )

    try:
        L.load_session_from_file(settings.instagram_username, session_file)
        logger.debug(f"instaloader Session geladen für Account '{account_id}'")
    except Exception as e:
        raise ValueError(
            f"instaloader Session-Datei ungültig für Account '{account_id}': {e}. "
            "Bitte /refresh_cookies ausführen."
        )

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
