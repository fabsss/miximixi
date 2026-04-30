# Instagram Auto Cookie-Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatischer Instagram Cookie-Refresh via Playwright — der Sync-Worker erkennt abgelaufene Cookies proaktiv und erneuert sie durch einen Browser-Login, ohne manuellen Eingriff.

**Architecture:** Neues Modul `instagram_auth.py` kapselt die gesamte Cookie-Logik (Validierung, Playwright-Login, Export). Der Sync-Worker ruft `ensure_valid_cookies()` proaktiv täglich auf und reaktiv bei Auth-Fehlern. Persistenter Playwright-Browser-Context auf externem Volume minimiert Login-Häufigkeit.

**Tech Stack:** Python 3.12, Playwright (async), psycopg2, python-telegram-bot, pytest-asyncio

---

## File Map

| Datei | Aktion | Inhalt |
|-------|--------|--------|
| `backend/app/instagram_auth.py` | Erstellen | Cookie-Validierung, Playwright-Login, Cookie-Export, DB-State |
| `backend/app/instagram_service.py` | Ändern | `ensure_valid_cookies()` vor API-Calls einbinden |
| `backend/app/instagram_sync_worker.py` | Ändern | Proaktiv-Check täglich + reaktiver Refresh bei Auth-Fehler |
| `backend/app/config.py` | Ändern | Neue Settings-Felder |
| `backend/app/telegram_bot.py` | Ändern | `/auth_status`-Kommando |
| `backend/pyproject.toml` | Ändern | `playwright` dependency |
| `backend/Dockerfile` | Ändern | `playwright install chromium --with-deps` |
| `docker-compose.yml` | Ändern | Volume für Browser-State + neue Cookie-Pfade |
| `.env.example` | Ändern | Neue Variablen dokumentieren |
| `backend/migrations/` | Erstellen | Migration für `instagram_auth_state`-Tabelle |
| `backend/tests/unit/test_instagram_auth.py` | Erstellen | Unit-Tests für Cookie-Validierung und Auth-State |

---

## Task 1: DB-Migration für `instagram_auth_state`

**Files:**
- Create: `backend/migrations/016_instagram_auth_state.sql`

- [ ] **Step 1: Migration schreiben**

Nächste freie Migrations-Nummer prüfen:
```bash
ls backend/migrations/
```

Datei `backend/migrations/016_instagram_auth_state.sql` erstellen:
```sql
CREATE TABLE IF NOT EXISTS instagram_auth_state (
    account_id TEXT PRIMARY KEY DEFAULT 'default',
    last_checked_at TIMESTAMPTZ,
    last_refresh_at TIMESTAMPTZ,
    refresh_fail_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO instagram_auth_state (account_id)
VALUES ('default')
ON CONFLICT (account_id) DO NOTHING;
```

- [ ] **Step 2: Migration lokal testen**

```bash
psql -U postgres -d miximixi -f backend/migrations/016_instagram_auth_state.sql
```
Expected: `CREATE TABLE` und `INSERT 0 1`

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/016_instagram_auth_state.sql
git commit -m "feat: add instagram_auth_state migration"
```

---

## Task 2: Neue Config-Felder

**Files:**
- Modify: `backend/app/config.py`
- Modify: `.env.example`

- [ ] **Step 1: Settings-Felder ergänzen**

In `backend/app/config.py` nach der Zeile `instagram_cookies_file: str = "instagram_cookies.txt"` folgendes einfügen:

```python
instagram_browser_state_dir: str = "/mnt/data/miximixi/instagram_browser_state"
instagram_cookie_refresh_threshold_days: int = 7
instagram_cookie_max_refresh_retries: int = 2
instagram_cookie_retry_interval: int = 1800  # 30 Minuten
```

Außerdem den Default für `instagram_cookies_file` anpassen:
```python
instagram_cookies_file: str = "/mnt/data/miximixi/instagram_cookies.txt"
```

- [ ] **Step 2: `.env.example` aktualisieren**

Im Block `# Instagram` folgende Zeilen ergänzen/ersetzen:
```env
# Cookies für yt-dlp Authentifizierung (auf externem Volume)
INSTAGRAM_COOKIES_FILE=/mnt/data/miximixi/instagram_cookies.txt

# Playwright Browser-State (persistenter Login-Context)
INSTAGRAM_BROWSER_STATE_DIR=/mnt/data/miximixi/instagram_browser_state

# Cookie-Refresh-Einstellungen
INSTAGRAM_COOKIE_REFRESH_THRESHOLD_DAYS=7
INSTAGRAM_COOKIE_MAX_REFRESH_RETRIES=2
INSTAGRAM_COOKIE_RETRY_INTERVAL=1800
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py .env.example
git commit -m "feat: add instagram auth refresh config fields"
```

---

## Task 3: `instagram_auth.py` — Cookie-Validierung und DB-State

**Files:**
- Create: `backend/app/instagram_auth.py`
- Create: `backend/tests/unit/test_instagram_auth.py`

- [ ] **Step 1: Failing Tests schreiben**

`backend/tests/unit/test_instagram_auth.py` erstellen:

```python
import os
import tempfile
import pytest
from datetime import datetime, timezone, timedelta
from http.cookiejar import MozillaCookieJar
from unittest.mock import patch, MagicMock

# Env vars vor dem Import setzen
os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/test_cookies.txt")
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp/test_browser_state")


def _write_cookies_file(path: str, expires: int):
    """Hilfsfunktion: schreibt eine minimale Netscape cookies.txt mit einem sessionid-Cookie."""
    with open(path, "w") as f:
        f.write("# Netscape HTTP Cookie File\n")
        f.write(f".instagram.com\tTRUE\t/\tTRUE\t{expires}\tsessionid\tABC123\n")


class TestIsCookieValid:
    def test_valid_cookie_returns_true(self, tmp_path):
        cookie_file = str(tmp_path / "cookies.txt")
        future = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
        _write_cookies_file(cookie_file, future)

        with patch("app.instagram_auth.settings") as mock_settings:
            mock_settings.instagram_cookies_file = cookie_file
            from app.instagram_auth import is_cookie_valid
            assert is_cookie_valid(threshold_days=7) is True

    def test_expiring_soon_returns_false(self, tmp_path):
        cookie_file = str(tmp_path / "cookies.txt")
        soon = int((datetime.now(timezone.utc) + timedelta(days=3)).timestamp())
        _write_cookies_file(cookie_file, soon)

        with patch("app.instagram_auth.settings") as mock_settings:
            mock_settings.instagram_cookies_file = cookie_file
            from app.instagram_auth import is_cookie_valid
            assert is_cookie_valid(threshold_days=7) is False

    def test_missing_file_returns_false(self, tmp_path):
        with patch("app.instagram_auth.settings") as mock_settings:
            mock_settings.instagram_cookies_file = str(tmp_path / "nonexistent.txt")
            from app.instagram_auth import is_cookie_valid
            assert is_cookie_valid(threshold_days=7) is False

    def test_no_sessionid_returns_false(self, tmp_path):
        cookie_file = str(tmp_path / "cookies.txt")
        with open(cookie_file, "w") as f:
            f.write("# Netscape HTTP Cookie File\n")
            f.write(".instagram.com\tTRUE\t/\tTRUE\t9999999999\tother_cookie\tval\n")

        with patch("app.instagram_auth.settings") as mock_settings:
            mock_settings.instagram_cookies_file = cookie_file
            from app.instagram_auth import is_cookie_valid
            assert is_cookie_valid(threshold_days=7) is False


class TestGetAuthState:
    def test_returns_default_state_when_no_db(self):
        with patch("app.instagram_auth.get_db_connection") as mock_db:
            mock_db.side_effect = Exception("no db")
            from app.instagram_auth import get_auth_state
            state = get_auth_state()
            assert state["account_id"] == "default"
            assert state["refresh_fail_count"] == 0

    def test_returns_db_state(self):
        mock_row = {
            "account_id": "default",
            "last_checked_at": datetime(2026, 4, 29, tzinfo=timezone.utc),
            "last_refresh_at": None,
            "refresh_fail_count": 1,
            "last_error": "checkpoint",
        }
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = mock_row
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        with patch("app.instagram_auth.get_db_connection", return_value=mock_conn):
            from app.instagram_auth import get_auth_state
            state = get_auth_state()
            assert state["refresh_fail_count"] == 1
            assert state["last_error"] == "checkpoint"
```

- [ ] **Step 2: Tests laufen lassen (müssen fehlschlagen)**

```bash
cd backend && poetry run pytest tests/unit/test_instagram_auth.py -v 2>&1 | head -30
```
Expected: `ModuleNotFoundError: No module named 'app.instagram_auth'`

- [ ] **Step 3: `instagram_auth.py` Grundgerüst mit Cookie-Validierung und DB-State schreiben**

`backend/app/instagram_auth.py` erstellen:

```python
"""
Instagram Auth Manager
Verantwortlich für: Cookie-Validierung, Playwright-Login, Cookie-Export, Auth-State in DB.
Zustandslos außer DB + Dateisystem — skaliert auf mehrere Accounts via account_id.
"""
import logging
import os
from datetime import datetime, timezone
from http.cookiejar import MozillaCookieJar
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


def get_db_connection():
    """Gibt eine neue psycopg2-Verbindung zurück."""
    import psycopg2
    return psycopg2.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        dbname=settings.db_name,
    )


def is_cookie_valid(threshold_days: int = 7, account_id: str = "default") -> bool:
    """
    Prüft lokal (ohne Netzwerk-Request) ob der sessionid-Cookie noch
    mindestens threshold_days gültig ist.
    """
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
        # Kein Ablaufdatum — als gültig betrachten (Session-Cookie)
        return True

    now_ts = datetime.now(timezone.utc).timestamp()
    threshold_ts = threshold_days * 24 * 3600
    remaining = session_cookie.expires - now_ts
    return remaining >= threshold_ts


def get_auth_state(account_id: str = "default") -> dict:
    """Liest den Auth-State aus der DB. Gibt Defaults zurück wenn DB nicht erreichbar."""
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
    """Aktualisiert den Auth-State in der DB. Fehler werden geloggt, nicht geworfen."""
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                fields = ["updated_at = NOW()"]
                values = []
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
```

- [ ] **Step 4: Tests laufen lassen**

```bash
cd backend && poetry run pytest tests/unit/test_instagram_auth.py -v
```
Expected: alle Tests grün

- [ ] **Step 5: Commit**

```bash
git add backend/app/instagram_auth.py backend/tests/unit/test_instagram_auth.py
git commit -m "feat: add instagram_auth module with cookie validation and db state"
```

---

## Task 4: Playwright-Dependency und Docker

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Playwright zu pyproject.toml hinzufügen**

In `backend/pyproject.toml` im Block `[tool.poetry.dependencies]` ergänzen:
```toml
playwright = "^1.44"
```

- [ ] **Step 2: Dependency installieren**

```bash
cd backend && poetry add playwright
poetry run playwright install chromium
```
Expected: `Successfully installed playwright-...` und Chromium-Download

- [ ] **Step 3: Dockerfile anpassen**

In `backend/Dockerfile` die Zeile nach `poetry install ...` einfügen:
```dockerfile
# Install Playwright Chromium browser
RUN poetry run playwright install chromium --with-deps
```

Die bestehenden System-Libs (`libnss3`, `libatk1.0-0` etc.) sind bereits vorhanden — `--with-deps` überschreibt das sicher.

- [ ] **Step 4: docker-compose.yml Volume ergänzen**

Im `backend`-Service unter `volumes:` zwei Zeilen ersetzen/ergänzen:

Alte Zeile:
```yaml
- /mnt/data/backup/miximixi/instagram_cookies.txt:/app/instagram_cookies.txt
```
Neue Zeilen:
```yaml
- /mnt/data/backup/miximixi/instagram_cookies.txt:/mnt/data/miximixi/instagram_cookies.txt
- /mnt/data/backup/miximixi/instagram_browser_state:/mnt/data/miximixi/instagram_browser_state
```

Hinweis: `instagram_session.json`-Volume kann entfernt werden — wird nicht mehr benötigt.

- [ ] **Step 5: Commit**

```bash
git add backend/pyproject.toml backend/poetry.lock backend/Dockerfile docker-compose.yml
git commit -m "feat: add playwright dependency and docker config for cookie refresh"
```

---

## Task 5: Playwright Login-Flow in `instagram_auth.py`

**Files:**
- Modify: `backend/app/instagram_auth.py`

- [ ] **Step 1: `refresh_cookies_via_playwright()` implementieren**

In `backend/app/instagram_auth.py` folgende Imports ergänzen:
```python
import asyncio
import random
import time
```

Dann diese Funktion anhängen:

```python
async def refresh_cookies_via_playwright(account_id: str = "default") -> bool:
    """
    Öffnet einen Playwright-Browser, loggt sich bei Instagram ein,
    und schreibt frische Cookies in INSTAGRAM_COOKIES_FILE.

    Gibt True zurück bei Erfolg, False bei Checkpoint/Fehler.
    Schreibt Ergebnis in instagram_auth_state.
    """
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
            # Menschliches Verhalten: kurze Pause vor dem ersten Request
            await asyncio.sleep(random.uniform(2, 5))
            await page.goto("https://www.instagram.com/accounts/login/", wait_until="networkidle")
            await asyncio.sleep(random.uniform(1, 3))

            # Cookie-Banner wegklicken falls vorhanden
            try:
                await page.click("text=Alle Cookies akzeptieren", timeout=3000)
                await asyncio.sleep(random.uniform(0.5, 1.5))
            except Exception:
                pass

            # Username zeichenweise eintippen
            username_field = page.locator('input[name="username"]')
            await username_field.click()
            for char in username:
                await username_field.type(char, delay=random.randint(80, 200))
            await asyncio.sleep(random.uniform(0.3, 0.8))

            # Password zeichenweise eintippen
            password_field = page.locator('input[name="password"]')
            await password_field.click()
            for char in password:
                await password_field.type(char, delay=random.randint(80, 200))
            await asyncio.sleep(random.uniform(0.5, 1.2))

            # Submit
            await page.click('button[type="submit"]')
            await page.wait_for_load_state("networkidle", timeout=15000)
            await asyncio.sleep(random.uniform(2, 4))

            # Checkpoint-Detection
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

            # Login fehlgeschlagen (noch auf Login-Seite)
            if "login" in current_url:
                logger.error("Login fehlgeschlagen — möglicherweise falsche Credentials")
                update_auth_state(
                    account_id=account_id,
                    last_checked_at=datetime.now(timezone.utc),
                    refresh_fail_count=_increment_fail_count(account_id),
                    last_error="Login fehlgeschlagen (falsche Credentials?)",
                )
                return False

            # Browser-State speichern
            await context.storage_state(path=storage_state_file)

            # Cookies als Netscape-Format in cookies.txt exportieren
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


def _increment_fail_count(account_id: str) -> int:
    """Liest aktuellen fail_count und gibt ihn + 1 zurück."""
    state = get_auth_state(account_id)
    return (state.get("refresh_fail_count") or 0) + 1


def _export_cookies_to_file(cookies: list, filepath: str) -> None:
    """
    Schreibt Playwright-Cookies im Netscape-Format (kompatibel mit yt-dlp/curl).
    """
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
```

- [ ] **Step 2: `ensure_valid_cookies()` implementieren**

In `backend/app/instagram_auth.py` anhängen:

```python
async def ensure_valid_cookies(account_id: str = "default") -> bool:
    """
    Stellt sicher dass gültige Cookies vorhanden sind.
    Refresht automatisch wenn nötig.
    Gibt True zurück wenn Cookies am Ende gültig sind, False wenn nicht.
    """
    threshold = settings.instagram_cookie_refresh_threshold_days

    if is_cookie_valid(threshold_days=threshold, account_id=account_id):
        return True

    logger.info("Cookies ungültig oder bald ablaufend — starte Refresh")
    return await _refresh_with_retry(account_id=account_id)


async def _refresh_with_retry(account_id: str = "default") -> bool:
    """Versucht den Refresh bis zu max_retries Mal."""
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
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/instagram_auth.py
git commit -m "feat: implement playwright login flow and ensure_valid_cookies"
```

---

## Task 6: `instagram_service.py` integrieren

**Files:**
- Modify: `backend/app/instagram_service.py`

- [ ] **Step 1: `ensure_valid_cookies()` einbinden**

In `backend/app/instagram_service.py` am Anfang der Datei Import ergänzen:
```python
from app.instagram_auth import ensure_valid_cookies
```

Die Funktion `_get_loader()` ist synchron — wir rufen `ensure_valid_cookies` hier **nicht** auf (das ist Aufgabe des Sync-Workers). Stattdessen wird `is_cookie_valid` genutzt um frühzeitig zu warnen:

```python
from app.instagram_auth import is_cookie_valid
```

Am Anfang von `_get_loader()`, nach dem `cookies_file`-Check, einfügen:
```python
if not is_cookie_valid(threshold_days=settings.instagram_cookie_refresh_threshold_days):
    logger.warning(
        "Instagram-Cookies sind abgelaufen oder laufen bald ab. "
        "Automatischer Refresh wird vom Sync-Worker ausgelöst."
    )
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/instagram_service.py
git commit -m "feat: add cookie validity warning in instagram_service"
```

---

## Task 7: Proaktiv-Check und reaktiver Refresh im Sync-Worker

**Files:**
- Modify: `backend/app/instagram_sync_worker.py`

- [ ] **Step 1: Imports ergänzen**

In `backend/app/instagram_sync_worker.py` folgende Imports ergänzen:
```python
from app.instagram_auth import ensure_valid_cookies, get_auth_state, update_auth_state
```

- [ ] **Step 2: Proaktiven Tages-Check einbauen**

In `run_instagram_sync()` am Anfang der Haupt-Loop (vor dem Collection-Fetch), nach dem `if not sync_control.enabled`-Block, folgendes einfügen:

```python
# Proaktiver Cookie-Check: einmal täglich
now = datetime.now(timezone.utc)
auth_state = get_auth_state()
last_checked = auth_state.get("last_checked_at")
should_check = (
    last_checked is None
    or (now - last_checked).total_seconds() >= 86400  # 24h
)
if should_check:
    logger.info("Täglicher proaktiver Cookie-Validity-Check")
    cookies_ok = await ensure_valid_cookies()
    if not cookies_ok:
        if notify_admin:
            await notify_admin(
                "⚠️ Instagram Cookie-Refresh fehlgeschlagen\n\n"
                "Automatischer Login konnte Cookies nicht erneuern "
                "(möglicherweise Checkpoint).\n\n"
                "Bitte Cookies manuell erneuern:\n"
                "1. instagram.com im Browser öffnen und einloggen\n"
                "2. Cookies via 'Get cookies.txt LOCALLY' exportieren\n"
                f"3. Datei nach {settings.instagram_cookies_file} kopieren"
            )
        if run_once:
            return {"error": "Cookie-Refresh fehlgeschlagen", "queued": 0}
        await asyncio.sleep(sync_interval)
        continue
    update_auth_state(last_checked_at=now)
```

- [ ] **Step 3: Reaktiven Refresh bei Auth-Fehler einbauen**

Den bestehenden `except ValueError as auth_error`-Block in `run_instagram_sync()` ersetzen:

```python
except ValueError as auth_error:
    error_msg = str(auth_error)
    logger.error(f"Instagram auth failed during sync: {error_msg}")

    # Reaktiver Refresh-Versuch
    logger.info("Starte reaktiven Cookie-Refresh nach Auth-Fehler")
    refresh_ok = await ensure_valid_cookies()

    if refresh_ok:
        logger.info("Reaktiver Cookie-Refresh erfolgreich — Sync wird fortgesetzt")
        if notify_admin:
            try:
                await notify_admin(
                    "✅ Instagram Cookies automatisch erneuert\n\n"
                    "Der Sync läuft weiter."
                )
            except Exception:
                pass
        # Kein sleep — sofort erneut versuchen
        continue

    # Refresh fehlgeschlagen
    logger.error("Reaktiver Cookie-Refresh fehlgeschlagen — Sync pausiert")
    if notify_admin:
        try:
            await notify_admin(
                "⚠️ Instagram Sync Auth Error\n\n"
                "Automatischer Cookie-Refresh fehlgeschlagen!\n\n"
                f"Fehler: {error_msg}\n\n"
                "Bitte Cookies manuell erneuern:\n"
                "1. instagram.com im Browser öffnen und einloggen\n"
                "2. Cookies via 'Get cookies.txt LOCALLY' exportieren\n"
                f"3. Datei nach {settings.instagram_cookies_file} kopieren"
            )
        except Exception as notify_error:
            logger.warning(f"Failed to notify admin: {notify_error}")

    if run_once:
        return {"error": error_msg, "queued": 0}
    await asyncio.sleep(sync_interval)
```

- [ ] **Step 4: `timezone` Import prüfen**

Sicherstellen dass `from datetime import datetime, timezone` im Import-Block steht (nicht nur `datetime`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/instagram_sync_worker.py
git commit -m "feat: add proactive daily cookie check and reactive refresh in sync worker"
```

---

## Task 8: `/auth_status` Telegram-Kommando

**Files:**
- Modify: `backend/app/telegram_bot.py`

- [ ] **Step 1: Handler implementieren**

In `backend/app/telegram_bot.py` die Funktion `auth_status_handler` ergänzen. Stelle zuerst sicher wo andere Handler registriert sind (suche nach `CommandHandler`), dann an der gleichen Stelle einfügen:

```python
async def auth_status_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Zeigt Instagram Auth-Status (Admin-only)."""
    user_id = str(update.effective_user.id)
    if settings.telegram_admin_ids and user_id not in settings.telegram_admin_ids:
        await update.message.reply_text("Keine Berechtigung.")
        return

    from app.instagram_auth import get_auth_state, is_cookie_valid

    state = get_auth_state()
    cookie_ok = is_cookie_valid(threshold_days=settings.instagram_cookie_refresh_threshold_days)

    def fmt_dt(dt):
        if dt is None:
            return "nie"
        return dt.strftime("%Y-%m-%d %H:%M UTC")

    status_icon = "✅" if cookie_ok else "❌"
    lines = [
        f"{status_icon} *Instagram Auth Status*",
        "",
        f"Cookie gültig: {'ja' if cookie_ok else 'nein (abgelaufen oder fehlt)'}",
        f"Letzter Check: {fmt_dt(state.get('last_checked_at'))}",
        f"Letzter Refresh: {fmt_dt(state.get('last_refresh_at'))}",
        f"Fehlgeschlagene Versuche: {state.get('refresh_fail_count', 0)}",
    ]
    if state.get("last_error"):
        lines.append(f"Letzter Fehler: `{state['last_error']}`")

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")
```

- [ ] **Step 2: Handler registrieren**

An der Stelle wo andere `CommandHandler`s registriert werden (suche nach `application.add_handler`):
```python
application.add_handler(CommandHandler("auth_status", auth_status_handler))
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/telegram_bot.py
git commit -m "feat: add /auth_status telegram command"
```

---

## Task 9: End-to-End-Test und Smoke-Check

- [ ] **Step 1: Unit-Tests laufen lassen**

```bash
cd backend && poetry run pytest tests/unit/test_instagram_auth.py -v
```
Expected: alle Tests grün

- [ ] **Step 2: Alle Tests laufen lassen**

```bash
cd backend && poetry run pytest tests/ -v 2>&1 | tail -20
```
Expected: keine Regressions

- [ ] **Step 3: Import-Check**

```bash
cd backend && poetry run python -c "from app.instagram_auth import ensure_valid_cookies, is_cookie_valid, get_auth_state; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Playwright-Installation verifizieren**

```bash
cd backend && poetry run python -c "from playwright.async_api import async_playwright; print('Playwright OK')"
```
Expected: `Playwright OK`

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: instagram auto cookie refresh via playwright - complete"
```
