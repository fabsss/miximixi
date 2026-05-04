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
    """Prüft ob eine gültige instaloader Session-Datei vorhanden ist (korrektes pickle-Format)."""
    import pickle
    username = settings.instagram_username or account_id
    session_file = os.path.join(settings.instagram_browser_state_dir, f"session-{username}")
    if not os.path.exists(session_file):
        logger.warning(f"Keine instaloader Session-Datei gefunden: {session_file}")
        return False
    try:
        with open(session_file, "rb") as f:
            data = pickle.load(f)
        # Muss ein dict mit sessionid sein (unser Format) oder ein CookieJar (altes Format → ungültig)
        if not isinstance(data, dict) or "sessionid" not in data:
            logger.warning(f"Session-Datei hat falsches Format (kein dict mit sessionid): {type(data)}")
            return False
        return True
    except Exception as e:
        logger.warning(f"Session-Datei nicht lesbar: {e}")
        return False


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
    clear_error: bool = False,
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
                elif clear_error:
                    fields.append("last_error = NULL")
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


def _build_instaloader_session_from_cookies(
    session_id: str, csrf_token: str, username: str
) -> None:
    """
    Erstellt eine instaloader Session-Datei aus sessionid + csrftoken (von Playwright).
    Format: pickle eines dicts — exakt was instaloader.save_session() / load_session() erwartet.
    """
    import pickle

    session_file = os.path.join(
        settings.instagram_browser_state_dir, f"session-{username}"
    )
    os.makedirs(settings.instagram_browser_state_dir, exist_ok=True)

    # instaloader.load_session() erwartet dict_from_cookiejar-Format (plain dict)
    # und setzt zwingend X-CSRFToken aus cookies['csrftoken']
    cookie_dict = {
        "sessionid": session_id,
        "csrftoken": csrf_token,
    }

    with open(session_file, "wb") as f:
        pickle.dump(cookie_dict, f)

    logger.info(f"instaloader Session-Datei aus Playwright-Cookies erstellt: {session_file}")


async def refresh_cookies_via_instaloader(account_id: str = "default") -> bool:
    """
    Login via Playwright — extrahiert sessionid und baut daraus eine instaloader Session.
    Direkte instaloader API-Logins (L.login()) werden von Instagram blockiert.
    """
    username = settings.instagram_username
    password = settings.instagram_password

    if not username or not password:
        logger.error("INSTAGRAM_USERNAME oder INSTAGRAM_PASSWORD nicht konfiguriert")
        update_auth_state(account_id=account_id, last_error="Credentials fehlen")
        return False

    session_file = os.path.join(
        settings.instagram_browser_state_dir, f"session-{username}"
    )

    # Zuerst: existierende Session testen ob sie noch gültig ist
    if os.path.exists(session_file):
        import instaloader
        try:
            L = instaloader.Instaloader(quiet=True)
            L.load_session_from_file(username, session_file)
            # Kurzer Test-Call um Session-Gültigkeit zu prüfen
            test_username = L.test_login()
            if test_username:
                logger.info(f"instaloader: existierende Session noch gültig für '{test_username}'")
                update_auth_state(
                    account_id=account_id,
                    last_checked_at=datetime.now(timezone.utc),
                    last_refresh_at=datetime.now(timezone.utc),
                    refresh_fail_count=0,
                    clear_error=True,
                )
                return True
            logger.info("instaloader: Session abgelaufen, starte Playwright-Login")
        except Exception as e:
            logger.info(f"instaloader: Session ungültig ({e}), starte Playwright-Login")

    # Playwright-Login: Browser-Login umgeht Instagram's API-Blocking
    logger.info(f"Starte Playwright-Login für Account '{username}'")
    result = await _login_via_playwright_get_sessionid(username, password, account_id)
    if not result:
        return False
    session_id, csrf_token = result

    # sessionid + csrftoken → instaloader Session-Datei
    try:
        _build_instaloader_session_from_cookies(session_id, csrf_token, username)
    except Exception as e:
        logger.exception(f"Fehler beim Erstellen der instaloader Session-Datei: {e}")
        update_auth_state(account_id=account_id, last_error=str(e)[:200])
        return False

    # Session-Datei verifizieren via test_login()
    import instaloader as _il
    session_file = os.path.join(settings.instagram_browser_state_dir, f"session-{username}")
    try:
        L = _il.Instaloader(quiet=True)
        L.load_session_from_file(username, session_file)
        test_user = await asyncio.get_event_loop().run_in_executor(None, L.test_login)
        if not test_user:
            logger.error("instaloader test_login fehlgeschlagen nach Playwright-Refresh — Session ungültig")
            update_auth_state(account_id=account_id, last_error="Session nach Refresh ungültig (test_login fehlgeschlagen)")
            return False
        logger.info(f"instaloader test_login erfolgreich: '{test_user}'")
    except Exception as e:
        logger.error(f"instaloader test_login Fehler: {e}")
        update_auth_state(account_id=account_id, last_error=f"test_login Fehler: {str(e)[:150]}")
        return False

    update_auth_state(
        account_id=account_id,
        last_checked_at=datetime.now(timezone.utc),
        last_refresh_at=datetime.now(timezone.utc),
        refresh_fail_count=0,
        clear_error=True,
    )
    logger.info("Cookie-Refresh via Playwright erfolgreich, instaloader Session verifiziert")
    return True


async def _login_via_playwright_get_sessionid(
    username: str, password: str, account_id: str
) -> tuple[str, str] | None:
    """Führt Playwright-Login durch und gibt (sessionid, csrftoken) zurück, oder None bei Fehler."""
    from playwright.async_api import async_playwright

    browser_state_path = os.path.join(settings.instagram_browser_state_dir, account_id)
    os.makedirs(browser_state_path, exist_ok=True)
    storage_state_file = os.path.join(browser_state_path, "storage_state.json")

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
                "https://www.instagram.com/accounts/login/",
                wait_until="load",
                timeout=60000,
            )
            await asyncio.sleep(random.uniform(1, 3))
            logger.info(f"Playwright: URL nach goto: {page.url}")

            # Wenn schon eingeloggt (Feed-Redirect) — Cookies direkt extrahieren
            if "login" not in page.url and "accounts" not in page.url:
                logger.info("Playwright: bereits eingeloggt (Feed-Redirect), extrahiere Cookies direkt")
                cookies = await context.cookies()
                session_id = next((c["value"] for c in cookies if c["name"] == "sessionid"), None)
                csrf_token = next((c["value"] for c in cookies if c["name"] == "csrftoken"), "")
                if session_id:
                    await context.storage_state(path=storage_state_file)
                    return session_id, csrf_token
                logger.warning("Playwright: Feed-Redirect aber kein sessionid Cookie — fahre mit Login fort")

            # Cookie-Banner wegklicken
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

            # Account-Auswahl-Dialog: "Weiter" / "Continue" klicken falls vorhanden
            for weiter_text in ["Weiter", "Continue"]:
                try:
                    btn = page.get_by_text(weiter_text, exact=True)
                    await btn.wait_for(state="visible", timeout=3000)
                    await btn.click()
                    logger.info(f"Playwright: Account-Auswahl '{weiter_text}' geklickt")
                    await page.wait_for_load_state("load", timeout=15000)
                    await asyncio.sleep(2)
                    break
                except Exception:
                    pass

            # Auf Login-Formular warten
            try:
                await page.wait_for_selector("input", timeout=15000)
            except Exception:
                logger.error(f"Playwright: Login-Formular nicht gefunden. URL: {page.url}")
                return None

            # Passwortfeld immer via type=password — sprachunabhängig
            password_inputs = page.locator("input[type='password']")
            pw_count = await password_inputs.count()
            visible_inputs = page.locator("input:not([type='submit']):not([type='hidden'])")
            input_count = await visible_inputs.count()
            logger.info(f"Playwright: {input_count} sichtbare Inputs, {pw_count} Passwort-Inputs")

            password_field = password_inputs.first
            await password_field.wait_for(state="visible", timeout=5000)

            if input_count >= 2:
                # Normales Login-Formular: Username + Passwort
                username_field = visible_inputs.nth(0)
                await username_field.click()
                await username_field.fill("")
                for char in username:
                    await username_field.type(char, delay=random.randint(80, 200))
                await asyncio.sleep(random.uniform(0.3, 0.8))

            await password_field.click()
            await password_field.fill("")
            for char in password:
                await password_field.type(char, delay=random.randint(80, 200))
            await asyncio.sleep(random.uniform(0.5, 1.2))

            # Submit-Button: DE "Anmelden" oder EN "Log in" / "Log In"
            submitted = False
            for btn_text in ["Anmelden", "Log in", "Log In"]:
                try:
                    btn = page.get_by_role("button", name=btn_text)
                    await btn.first.wait_for(state="visible", timeout=2000)
                    await btn.first.click()
                    submitted = True
                    logger.info(f"Playwright: Submit-Button '{btn_text}' geklickt")
                    break
                except Exception:
                    pass
            if not submitted:
                logger.error("Playwright: Kein Submit-Button gefunden")
                return None
            await page.wait_for_load_state("load", timeout=15000)
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
                return None

            if "login" in current_url:
                logger.error("Playwright: Login fehlgeschlagen — falsche Credentials?")
                update_auth_state(
                    account_id=account_id,
                    last_checked_at=datetime.now(timezone.utc),
                    refresh_fail_count=_increment_fail_count(account_id),
                    last_error="Login fehlgeschlagen (falsche Credentials?)",
                )
                return None

            # sessionid + csrftoken aus Cookies extrahieren
            cookies = await context.cookies()
            session_id = next(
                (c["value"] for c in cookies if c["name"] == "sessionid"), None
            )
            csrf_token = next(
                (c["value"] for c in cookies if c["name"] == "csrftoken"), ""
            )
            if not session_id:
                logger.error("Playwright: Kein sessionid-Cookie nach Login")
                update_auth_state(
                    account_id=account_id,
                    last_error="Kein sessionid nach Playwright-Login",
                )
                return None

            # storage_state für nächsten Login speichern
            await context.storage_state(path=storage_state_file)
            logger.info("Playwright-Login erfolgreich, sessionid + csrftoken extrahiert")
            return session_id, csrf_token

        except Exception as e:
            logger.exception(f"Playwright-Fehler beim Login: {e}")
            update_auth_state(
                account_id=account_id,
                last_checked_at=datetime.now(timezone.utc),
                last_error=str(e),
            )
            return None
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
        success = await refresh_cookies_via_instaloader(account_id=account_id)
        if success:
            return True
        if attempt < max_retries:
            logger.info(f"Refresh fehlgeschlagen, nächster Versuch in {retry_interval}s")
            await asyncio.sleep(retry_interval)
    logger.error(f"Cookie-Refresh nach {max_retries} Versuchen fehlgeschlagen")
    return False
