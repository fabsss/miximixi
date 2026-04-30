"""
Instagram Auth Manager
Verantwortlich für: Cookie-Validierung, Playwright-Login, Cookie-Export, Auth-State in DB.
"""
import asyncio
import logging
import os
import random
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


async def refresh_cookies_via_playwright(account_id: str = "default") -> bool:
    from playwright.async_api import async_playwright

    username = settings.instagram_username
    password = settings.instagram_password

    if not username or not password:
        logger.error("INSTAGRAM_USERNAME oder INSTAGRAM_PASSWORD nicht konfiguriert")
        update_auth_state(account_id=account_id, last_error="Credentials fehlen")
        return False

    browser_state_path = os.path.join(settings.instagram_browser_state_dir, account_id)
    os.makedirs(browser_state_path, exist_ok=True)
    storage_state_file = os.path.join(browser_state_path, "storage_state.json")

    logger.info(f"Starte Playwright Cookie-Refresh für Account '{account_id}'")

    async with async_playwright() as p:
        context_options = {
            "user_agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "viewport": {"width": 1280, "height": 800},
            "locale": "de-DE",
        }
        if os.path.exists(storage_state_file):
            context_options["storage_state"] = storage_state_file

        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(**context_options)
        page = await context.new_page()

        try:
            await asyncio.sleep(random.uniform(2, 5))
            await page.goto(
                "https://www.instagram.com/accounts/login/", wait_until="networkidle"
            )
            await asyncio.sleep(random.uniform(1, 3))

            logger.info(f"Playwright: aktuelle URL nach goto: {page.url}")
            logger.info(f"Playwright: Seitentitel: {await page.title()}")
            # Screenshot für Debugging
            screenshot_path = "/tmp/miximixi/playwright_debug.png"
            os.makedirs("/tmp/miximixi", exist_ok=True)
            await page.screenshot(path=screenshot_path, full_page=True)
            logger.info(f"Playwright: Screenshot gespeichert unter {screenshot_path}")
            # Alle sichtbaren Buttons loggen
            buttons = await page.locator("button").all_text_contents()
            logger.info(f"Playwright: Sichtbare Buttons: {buttons[:10]}")

            # Cookie-Banner wegklicken — auf Dialog warten, dann Accept-Button klicken
            try:
                await page.wait_for_selector('[role="dialog"]', timeout=5000)
                for text in [
                    "Alle Cookies erlauben",
                    "Allow all cookies",
                    "Alle Cookies akzeptieren",
                    "Accept all",
                ]:
                    try:
                        btn = page.get_by_role("button", name=text)
                        await btn.wait_for(state="visible", timeout=2000)
                        await btn.click()
                        logger.info(f"Playwright: Cookie-Banner geklickt: '{text}'")
                        await asyncio.sleep(random.uniform(1.5, 2.5))
                        break
                    except Exception:
                        pass
            except Exception:
                pass

            # Screenshot nach Cookie-Banner-Click
            await page.screenshot(path="/tmp/miximixi/playwright_after_cookie.png", full_page=True)
            buttons2 = await page.locator("button").all_text_contents()
            logger.info(f"Playwright: Buttons nach Cookie-Click: {buttons2[:10]}")

            # Warten bis Login-Formular sichtbar ist (erscheint erst nach Banner-Dismiss)
            # Instagram entfernt name-Attribute — per ARIA-Label oder type suchen
            # Warten auf erstes Input-Feld (Username) — kein stabiles name/aria-label vorhanden
            try:
                await page.wait_for_selector('input', timeout=15000)
            except Exception:
                current_url = page.url
                page_content = await page.content()
                logger.error(
                    f"Playwright: Login-Formular nicht gefunden. URL: {current_url}. "
                    f"HTML-Ausschnitt: {page_content[:500]}"
                )
                raise

            # Erstes Input = Username, zweites = Passwort
            inputs = page.locator('input')
            username_field = inputs.nth(0)
            password_field = inputs.nth(1)

            await username_field.click()
            for char in username:
                await username_field.type(char, delay=random.randint(80, 200))
            await asyncio.sleep(random.uniform(0.3, 0.8))

            await password_field.click()
            for char in password:
                await password_field.type(char, delay=random.randint(80, 200))
            await asyncio.sleep(random.uniform(0.5, 1.2))

            await page.click('button[type="submit"]')
            await page.wait_for_load_state("networkidle", timeout=15000)
            await asyncio.sleep(random.uniform(2, 4))

            current_url = page.url
            if "/challenge/" in current_url or "/checkpoint/" in current_url:
                logger.warning(f"Instagram Checkpoint erkannt: {current_url}")
                update_auth_state(
                    account_id=account_id,
                    last_checked_at=datetime.now(timezone.utc),
                    refresh_fail_count=_increment_fail_count(account_id),
                    last_error=f"Checkpoint: {current_url}",
                )
                return False

            if "login" in current_url:
                logger.error("Login fehlgeschlagen — möglicherweise falsche Credentials")
                update_auth_state(
                    account_id=account_id,
                    last_checked_at=datetime.now(timezone.utc),
                    refresh_fail_count=_increment_fail_count(account_id),
                    last_error="Login fehlgeschlagen (falsche Credentials?)",
                )
                return False

            await context.storage_state(path=storage_state_file)
            cookies = await context.cookies()
            _export_cookies_to_file(cookies, settings.instagram_cookies_file)

            update_auth_state(
                account_id=account_id,
                last_checked_at=datetime.now(timezone.utc),
                last_refresh_at=datetime.now(timezone.utc),
                refresh_fail_count=0,
                last_error=None,
            )
            logger.info("Cookie-Refresh erfolgreich")
            return True

        except Exception as e:
            logger.exception(f"Playwright-Fehler beim Cookie-Refresh: {e}")
            update_auth_state(
                account_id=account_id,
                last_checked_at=datetime.now(timezone.utc),
                last_error=str(e),
            )
            return False
        finally:
            await context.close()
            await browser.close()


async def ensure_valid_cookies(account_id: str = "default") -> bool:
    threshold = settings.instagram_cookie_refresh_threshold_days
    if is_cookie_valid(threshold_days=threshold, account_id=account_id):
        return True
    logger.info("Cookies ungültig oder bald ablaufend — starte Refresh")
    return await _refresh_with_retry(account_id=account_id)


async def _refresh_with_retry(account_id: str = "default") -> bool:
    max_retries = settings.instagram_cookie_max_refresh_retries
    retry_interval = settings.instagram_cookie_retry_interval
    for attempt in range(1, max_retries + 1):
        logger.info(f"Cookie-Refresh Versuch {attempt}/{max_retries}")
        success = await refresh_cookies_via_playwright(account_id=account_id)
        if success:
            return True
        if attempt < max_retries:
            logger.info(f"Refresh fehlgeschlagen, nächster Versuch in {retry_interval}s")
            await asyncio.sleep(retry_interval)
    logger.error(f"Cookie-Refresh nach {max_retries} Versuchen fehlgeschlagen")
    return False
