"""
Instagram Auth Manager
Verantwortlich für: Cookie-Validierung, Playwright-Login, Cookie-Export, Auth-State in DB.
"""
import logging
import os
from datetime import datetime, timezone
from http.cookiejar import MozillaCookieJar
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


def get_db_connection():
    import psycopg2
    return psycopg2.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        dbname=settings.db_name,
    )


def is_cookie_valid(threshold_days: int = 7, account_id: str = "default") -> bool:
    cookies_file = settings.instagram_cookies_file
    if not os.path.exists(cookies_file):
        logger.warning(f"Cookies-Datei nicht gefunden: {cookies_file}")
        return False
    try:
        jar = MozillaCookieJar(cookies_file)
        jar.load(ignore_discard=True, ignore_expires=True)
    except Exception as e:
        logger.warning(f"Cookies-Datei konnte nicht geladen werden: {e}")
        return False
    session_cookie = next(
        (c for c in jar if c.name == "sessionid" and "instagram.com" in c.domain),
        None,
    )
    if not session_cookie:
        logger.warning("Kein sessionid-Cookie gefunden")
        return False
    if not session_cookie.expires:
        return True  # Session-Cookie ohne Ablaufdatum gilt als gültig
    now_ts = datetime.now(timezone.utc).timestamp()
    remaining = session_cookie.expires - now_ts
    return remaining >= threshold_days * 24 * 3600


def get_auth_state(account_id: str = "default") -> dict:
    default = {
        "account_id": account_id,
        "last_checked_at": None,
        "last_refresh_at": None,
        "refresh_fail_count": 0,
        "last_error": None,
    }
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT account_id, last_checked_at, last_refresh_at, "
                    "refresh_fail_count, last_error "
                    "FROM instagram_auth_state WHERE account_id = %s",
                    (account_id,),
                )
                row = cur.fetchone()
                if row:
                    return {
                        "account_id": row[0],
                        "last_checked_at": row[1],
                        "last_refresh_at": row[2],
                        "refresh_fail_count": row[3],
                        "last_error": row[4],
                    }
        finally:
            conn.close()
    except Exception as e:
        logger.warning(f"Auth-State aus DB nicht lesbar (using defaults): {e}")
    return default


def update_auth_state(
    account_id: str = "default",
    last_checked_at: Optional[datetime] = None,
    last_refresh_at: Optional[datetime] = None,
    refresh_fail_count: Optional[int] = None,
    last_error: Optional[str] = None,
) -> None:
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                fields = ["updated_at = NOW()"]
                values: list = []
                if last_checked_at is not None:
                    fields.append("last_checked_at = %s")
                    values.append(last_checked_at)
                if last_refresh_at is not None:
                    fields.append("last_refresh_at = %s")
                    values.append(last_refresh_at)
                if refresh_fail_count is not None:
                    fields.append("refresh_fail_count = %s")
                    values.append(refresh_fail_count)
                if last_error is not None:
                    fields.append("last_error = %s")
                    values.append(last_error)
                values.append(account_id)
                cur.execute(
                    f"UPDATE instagram_auth_state SET {', '.join(fields)} "
                    f"WHERE account_id = %s",
                    values,
                )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        logger.warning(f"Auth-State konnte nicht gespeichert werden: {e}")


def _increment_fail_count(account_id: str) -> int:
    state = get_auth_state(account_id)
    return (state.get("refresh_fail_count") or 0) + 1


def _export_cookies_to_file(cookies: list, filepath: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    lines = ["# Netscape HTTP Cookie File\n"]
    for c in cookies:
        domain = c.get("domain", "")
        http_only = str(c.get("httpOnly", False)).upper()
        path = c.get("path", "/")
        secure = str(c.get("secure", False)).upper()
        expires = int(c.get("expires", 0)) if c.get("expires") else 0
        name = c.get("name", "")
        value = c.get("value", "")
        lines.append(f"{domain}\t{http_only}\t{path}\t{secure}\t{expires}\t{name}\t{value}\n")
    with open(filepath, "w") as f:
        f.writelines(lines)
    logger.info(f"Cookies exportiert nach {filepath} ({len(cookies)} Einträge)")
