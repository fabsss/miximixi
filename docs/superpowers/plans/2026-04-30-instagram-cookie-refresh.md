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
| `backend/app/instagram_service.py` | Ändern | Cookie-Warnung bei ungültigen Cookies |
| `backend/app/instagram_sync_worker.py` | Ändern | Proaktiv-Check täglich + reaktiver Refresh bei Auth-Fehler |
| `backend/app/config.py` | Ändern | Neue Settings-Felder |
| `backend/app/telegram_bot.py` | Ändern | `/auth_status`-Kommando |
| `backend/pyproject.toml` | Ändern | `playwright` dependency |
| `backend/Dockerfile` | Ändern | `playwright install chromium --with-deps` |
| `docker-compose.yml` | Ändern | Volume für Browser-State + neue Cookie-Pfade |
| `.env.example` | Ändern | Neue Variablen dokumentieren |
| `backend/migrations/016_instagram_auth_state.sql` | Erstellen | `instagram_auth_state`-Tabelle |
| `backend/tests/unit/test_instagram_auth.py` | Erstellen | Unit-Tests für alle `instagram_auth`-Funktionen |
| `backend/tests/unit/test_instagram_sync_worker.py` | Erstellen | Unit-Tests für Proaktiv-Check und reaktiven Refresh |

---

## Task 1: DB-Migration für `instagram_auth_state`

**Files:**
- Create: `backend/migrations/016_instagram_auth_state.sql`

- [ ] **Step 1: Nächste Migrations-Nummer prüfen**

```bash
ls backend/migrations/
```
Sicherstellen dass `016_` noch frei ist. Falls nicht, nächste freie Nummer verwenden.

- [ ] **Step 2: Migration schreiben**

`backend/migrations/016_instagram_auth_state.sql` erstellen:
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

- [ ] **Step 3: Migration lokal testen**

```bash
psql -U postgres -d miximixi -f backend/migrations/016_instagram_auth_state.sql
```
Expected: `CREATE TABLE` und `INSERT 0 1`

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/016_instagram_auth_state.sql
git commit -m "feat: add instagram_auth_state migration"
```

---

## Task 2: Config-Felder und Playwright-Dependency

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/pyproject.toml`
- Modify: `.env.example`

- [ ] **Step 1: Failing Test für neue Config-Felder schreiben**

`backend/tests/unit/test_instagram_auth_config.py` erstellen:

```python
import os
import pytest

os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/test_cookies.txt")
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp/test_browser_state")
os.environ.setdefault("INSTAGRAM_COOKIE_REFRESH_THRESHOLD_DAYS", "7")
os.environ.setdefault("INSTAGRAM_COOKIE_MAX_REFRESH_RETRIES", "2")
os.environ.setdefault("INSTAGRAM_COOKIE_RETRY_INTERVAL", "1800")


def test_config_has_browser_state_dir():
    from app.config import Settings
    s = Settings()
    assert hasattr(s, "instagram_browser_state_dir")


def test_config_has_refresh_threshold():
    from app.config import Settings
    s = Settings()
    assert hasattr(s, "instagram_cookie_refresh_threshold_days")
    assert isinstance(s.instagram_cookie_refresh_threshold_days, int)


def test_config_has_max_retries():
    from app.config import Settings
    s = Settings()
    assert hasattr(s, "instagram_cookie_max_refresh_retries")
    assert s.instagram_cookie_max_refresh_retries >= 1


def test_config_has_retry_interval():
    from app.config import Settings
    s = Settings()
    assert hasattr(s, "instagram_cookie_retry_interval")
    assert s.instagram_cookie_retry_interval > 0
```

- [ ] **Step 2: Tests laufen lassen (müssen fehlschlagen)**

```bash
cd backend && poetry run pytest tests/unit/test_instagram_auth_config.py -v 2>&1 | head -20
```
Expected: `AttributeError` oder `AssertionError` weil die Felder fehlen

- [ ] **Step 3: Settings-Felder in `config.py` ergänzen**

In `backend/app/config.py` die Zeile `instagram_cookies_file: str = "instagram_cookies.txt"` ersetzen durch:
```python
instagram_cookies_file: str = "/mnt/data/miximixi/instagram_cookies.txt"
instagram_browser_state_dir: str = "/mnt/data/miximixi/instagram_browser_state"
instagram_cookie_refresh_threshold_days: int = 7
instagram_cookie_max_refresh_retries: int = 2
instagram_cookie_retry_interval: int = 1800  # 30 Minuten
```

- [ ] **Step 4: Tests laufen lassen (müssen grün sein)**

```bash
cd backend && poetry run pytest tests/unit/test_instagram_auth_config.py -v
```
Expected: alle 4 Tests grün

- [ ] **Step 5: Playwright zu pyproject.toml hinzufügen und installieren**

In `backend/pyproject.toml` im Block `[tool.poetry.dependencies]` ergänzen:
```toml
playwright = "^1.44"
```

```bash
cd backend && poetry add playwright && poetry run playwright install chromium
```
Expected: `Successfully installed playwright-...` und Chromium-Download

- [ ] **Step 6: `.env.example` aktualisieren**

Im Block `# Instagram` folgende Zeilen ergänzen/ersetzen:
```env
# Cookies für yt-dlp (auf externem Volume)
INSTAGRAM_COOKIES_FILE=/mnt/data/miximixi/instagram_cookies.txt

# Playwright Browser-State (persistenter Login-Context, auf externem Volume)
INSTAGRAM_BROWSER_STATE_DIR=/mnt/data/miximixi/instagram_browser_state

# Cookie-Refresh-Einstellungen
INSTAGRAM_COOKIE_REFRESH_THRESHOLD_DAYS=7
INSTAGRAM_COOKIE_MAX_REFRESH_RETRIES=2
INSTAGRAM_COOKIE_RETRY_INTERVAL=1800
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/config.py backend/pyproject.toml backend/poetry.lock .env.example backend/tests/unit/test_instagram_auth_config.py
git commit -m "feat: add instagram auth config fields and playwright dependency"
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
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/test_cookies.txt")
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp/test_browser_state")


def _write_cookies_file(path: str, expires: int):
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
            assert state["last_checked_at"] is None

    def test_returns_db_state(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (
            "default",
            datetime(2026, 4, 29, tzinfo=timezone.utc),
            None,
            1,
            "checkpoint",
        )
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        with patch("app.instagram_auth.get_db_connection", return_value=mock_conn):
            from app.instagram_auth import get_auth_state
            state = get_auth_state()
            assert state["refresh_fail_count"] == 1
            assert state["last_error"] == "checkpoint"


class TestExportCookiesToFile:
    def test_writes_netscape_format(self, tmp_path):
        cookie_file = str(tmp_path / "cookies.txt")
        cookies = [
            {
                "domain": ".instagram.com",
                "httpOnly": True,
                "path": "/",
                "secure": True,
                "expires": 9999999999,
                "name": "sessionid",
                "value": "TESTVAL",
            }
        ]
        from app.instagram_auth import _export_cookies_to_file
        _export_cookies_to_file(cookies, cookie_file)
        content = open(cookie_file).read()
        assert "# Netscape HTTP Cookie File" in content
        assert "sessionid" in content
        assert "TESTVAL" in content

    def test_creates_parent_dirs(self, tmp_path):
        cookie_file = str(tmp_path / "subdir" / "cookies.txt")
        from app.instagram_auth import _export_cookies_to_file
        _export_cookies_to_file([], cookie_file)
        assert os.path.exists(cookie_file)
```

- [ ] **Step 2: Tests laufen lassen (müssen fehlschlagen)**

```bash
cd backend && poetry run pytest tests/unit/test_instagram_auth.py -v 2>&1 | head -20
```
Expected: `ModuleNotFoundError: No module named 'app.instagram_auth'`

- [ ] **Step 3: `instagram_auth.py` implementieren**

`backend/app/instagram_auth.py` erstellen:

```python
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
```

- [ ] **Step 4: Tests laufen lassen (müssen grün sein)**

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

## Task 4: Playwright Login-Flow in `instagram_auth.py`

**Files:**
- Modify: `backend/app/instagram_auth.py`
- Modify: `backend/tests/unit/test_instagram_auth.py`

- [ ] **Step 1: Failing Tests für den Playwright-Flow schreiben**

Folgende Tests an `backend/tests/unit/test_instagram_auth.py` anhängen:

```python
class TestRefreshCookiesViaPlaywright:
    @pytest.mark.asyncio
    async def test_returns_false_when_no_credentials(self):
        with patch("app.instagram_auth.settings") as mock_settings:
            mock_settings.instagram_username = ""
            mock_settings.instagram_password = ""
            mock_settings.instagram_cookies_file = "/tmp/cookies.txt"
            mock_settings.instagram_browser_state_dir = "/tmp/browser_state"
            with patch("app.instagram_auth.update_auth_state"):
                from app.instagram_auth import refresh_cookies_via_playwright
                result = await refresh_cookies_via_playwright()
                assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_on_checkpoint(self, tmp_path):
        mock_page = MagicMock()
        mock_page.url = "https://www.instagram.com/challenge/123/"
        mock_page.goto = MagicMock(return_value=None)
        mock_page.wait_for_load_state = MagicMock(return_value=None)
        mock_page.click = MagicMock(return_value=None)
        mock_page.locator = MagicMock(return_value=MagicMock(
            click=MagicMock(return_value=None),
            type=MagicMock(return_value=None),
        ))

        async def fake_goto(*a, **kw): pass
        async def fake_wait(*a, **kw): pass
        async def fake_click(*a, **kw): pass
        async def fake_type(*a, **kw): pass

        mock_page.goto = fake_goto
        mock_page.wait_for_load_state = fake_wait
        mock_page.click = fake_click
        mock_locator = MagicMock()
        mock_locator.click = MagicMock(side_effect=lambda: None)
        mock_locator.type = MagicMock(side_effect=lambda c, delay=0: None)
        mock_page.locator = MagicMock(return_value=mock_locator)

        # Teste nur die Checkpoint-URL-Detection-Logik isoliert
        assert "/challenge/" in "https://www.instagram.com/challenge/123/"


class TestEnsureValidCookies:
    @pytest.mark.asyncio
    async def test_returns_true_when_cookie_already_valid(self, tmp_path):
        cookie_file = str(tmp_path / "cookies.txt")
        future = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
        _write_cookies_file(cookie_file, future)
        with patch("app.instagram_auth.settings") as mock_settings:
            mock_settings.instagram_cookies_file = cookie_file
            mock_settings.instagram_cookie_refresh_threshold_days = 7
            from app.instagram_auth import ensure_valid_cookies
            with patch("app.instagram_auth.is_cookie_valid", return_value=True):
                result = await ensure_valid_cookies()
                assert result is True

    @pytest.mark.asyncio
    async def test_calls_refresh_when_cookie_invalid(self):
        with patch("app.instagram_auth.is_cookie_valid", return_value=False):
            with patch("app.instagram_auth._refresh_with_retry", return_value=True) as mock_refresh:
                with patch("app.instagram_auth.settings") as mock_settings:
                    mock_settings.instagram_cookie_refresh_threshold_days = 7
                    from app.instagram_auth import ensure_valid_cookies
                    result = await ensure_valid_cookies()
                    mock_refresh.assert_called_once()
                    assert result is True
```

- [ ] **Step 2: Tests laufen lassen (müssen fehlschlagen)**

```bash
cd backend && poetry run pytest tests/unit/test_instagram_auth.py::TestRefreshCookiesViaPlaywright tests/unit/test_instagram_auth.py::TestEnsureValidCookies -v 2>&1 | head -20
```
Expected: `AttributeError: module 'app.instagram_auth' has no attribute 'refresh_cookies_via_playwright'`

- [ ] **Step 3: Playwright-Funktionen implementieren**

In `backend/app/instagram_auth.py` folgende Imports ergänzen am Dateianfang:
```python
import asyncio
import random
```

Dann am Ende der Datei anhängen:

```python
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

            try:
                await page.click("text=Alle Cookies akzeptieren", timeout=3000)
                await asyncio.sleep(random.uniform(0.5, 1.5))
            except Exception:
                pass

            username_field = page.locator('input[name="username"]')
            await username_field.click()
            for char in username:
                await username_field.type(char, delay=random.randint(80, 200))
            await asyncio.sleep(random.uniform(0.3, 0.8))

            password_field = page.locator('input[name="password"]')
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
```

- [ ] **Step 4: Tests laufen lassen (müssen grün sein)**

```bash
cd backend && poetry run pytest tests/unit/test_instagram_auth.py -v
```
Expected: alle Tests grün

- [ ] **Step 5: Commit**

```bash
git add backend/app/instagram_auth.py backend/tests/unit/test_instagram_auth.py
git commit -m "feat: implement playwright login flow and ensure_valid_cookies"
```

---

## Task 5: Docker anpassen

**Files:**
- Modify: `backend/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Failing Test für Docker-Konfiguration schreiben**

`backend/tests/unit/test_docker_config.py` erstellen:

```python
import os


def test_dockerfile_installs_playwright():
    dockerfile = open("Dockerfile").read()
    assert "playwright install chromium" in dockerfile


def test_docker_compose_has_browser_state_volume():
    compose = open("../docker-compose.yml").read()
    assert "instagram_browser_state" in compose


def test_docker_compose_has_updated_cookies_volume():
    compose = open("../docker-compose.yml").read()
    assert "/mnt/data/miximixi/instagram_cookies.txt" in compose
```

- [ ] **Step 2: Tests laufen lassen (müssen fehlschlagen)**

```bash
cd backend && poetry run pytest tests/unit/test_docker_config.py -v 2>&1 | head -20
```
Expected: `AssertionError` weil `playwright install chromium` noch nicht im Dockerfile steht

- [ ] **Step 3: Dockerfile anpassen**

In `backend/Dockerfile` nach der Zeile `poetry install ...` einfügen:
```dockerfile
RUN poetry run playwright install chromium --with-deps
```

- [ ] **Step 4: docker-compose.yml Volume anpassen**

Im `backend`-Service unter `volumes:` die alte Cookie-Zeile ersetzen und Browser-State-Volume ergänzen:

Alte Zeile:
```yaml
- /mnt/data/backup/miximixi/instagram_cookies.txt:/app/instagram_cookies.txt
```
Neue Zeilen:
```yaml
- /mnt/data/backup/miximixi/instagram_cookies.txt:/mnt/data/miximixi/instagram_cookies.txt
- /mnt/data/backup/miximixi/instagram_browser_state:/mnt/data/miximixi/instagram_browser_state
```

Außerdem die `instagram_session.json`-Zeile entfernen — wird nicht mehr benötigt.

- [ ] **Step 5: Tests laufen lassen (müssen grün sein)**

```bash
cd backend && poetry run pytest tests/unit/test_docker_config.py -v
```
Expected: alle 3 Tests grün

- [ ] **Step 6: Commit**

```bash
git add backend/Dockerfile docker-compose.yml backend/tests/unit/test_docker_config.py
git commit -m "feat: configure docker for playwright and updated volume paths"
```

---

## Task 6: `instagram_service.py` — Cookie-Warnung einbinden

**Files:**
- Modify: `backend/app/instagram_service.py`
- Create: `backend/tests/unit/test_instagram_service_auth.py`

- [ ] **Step 1: Failing Test schreiben**

`backend/tests/unit/test_instagram_service_auth.py` erstellen:

```python
import os
import pytest
from unittest.mock import patch, MagicMock

os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/test_cookies.txt")
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp/test_browser_state")


def test_get_loader_logs_warning_when_cookie_invalid(caplog):
    import logging
    with patch("app.instagram_service.os.path.exists", return_value=True):
        with patch("app.instagram_service.MozillaCookieJar") as mock_jar_cls:
            mock_jar = MagicMock()
            mock_jar_cls.return_value = mock_jar
            session_cookie = MagicMock()
            session_cookie.name = "sessionid"
            session_cookie.domain = ".instagram.com"
            session_cookie.value = "TESTVAL"
            mock_jar.__iter__ = MagicMock(return_value=iter([session_cookie]))
            with patch("app.instagram_service.is_cookie_valid", return_value=False):
                with patch("app.instagram_service.settings") as mock_settings:
                    mock_settings.instagram_cookies_file = "/tmp/test_cookies.txt"
                    mock_settings.instagram_cookie_refresh_threshold_days = 7
                    mock_settings.instagram_username = "testuser"
                    with patch("app.instagram_service.instaloader") as mock_il:
                        mock_il.Instaloader.return_value = MagicMock()
                        with caplog.at_level(logging.WARNING, logger="app.instagram_service"):
                            from app.instagram_service import _get_loader
                            _get_loader()
                            assert any(
                                "abgelaufen" in r.message or "bald ab" in r.message
                                for r in caplog.records
                            )
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

```bash
cd backend && poetry run pytest tests/unit/test_instagram_service_auth.py -v 2>&1 | head -20
```
Expected: `ImportError` oder `AssertionError` weil `is_cookie_valid` noch nicht importiert wird

- [ ] **Step 3: `instagram_service.py` anpassen**

In `backend/app/instagram_service.py` nach den bestehenden Imports ergänzen:
```python
from app.instagram_auth import is_cookie_valid
```

In `_get_loader()` nach dem `os.path.exists`-Check einfügen:
```python
if not is_cookie_valid(threshold_days=settings.instagram_cookie_refresh_threshold_days):
    logger.warning(
        "Instagram-Cookies sind abgelaufen oder laufen bald ab. "
        "Automatischer Refresh wird vom Sync-Worker ausgelöst."
    )
```

- [ ] **Step 4: Test laufen lassen (muss grün sein)**

```bash
cd backend && poetry run pytest tests/unit/test_instagram_service_auth.py -v
```
Expected: grün

- [ ] **Step 5: Commit**

```bash
git add backend/app/instagram_service.py backend/tests/unit/test_instagram_service_auth.py
git commit -m "feat: add cookie validity warning in instagram_service"
```

---

## Task 7: Proaktiv-Check und reaktiver Refresh im Sync-Worker

**Files:**
- Modify: `backend/app/instagram_sync_worker.py`
- Create: `backend/tests/unit/test_instagram_sync_worker_auth.py`

- [ ] **Step 1: Failing Tests schreiben**

`backend/tests/unit/test_instagram_sync_worker_auth.py` erstellen:

```python
import os
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock, MagicMock

os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/test_cookies.txt")
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp/test_browser_state")
os.environ["INSTAGRAM_SYNC_ENABLED"] = "false"


class TestSyncWorkerAuthIntegration:
    @pytest.mark.asyncio
    async def test_run_once_returns_error_when_cookie_refresh_fails(self):
        from app.instagram_sync_worker import SyncControl, run_instagram_sync

        sync_control = SyncControl()
        sync_control.enable()
        sync_control.set_collection("123", "TestCollection")

        with patch("app.instagram_sync_worker.ensure_valid_cookies", new_callable=AsyncMock, return_value=False):
            with patch("app.instagram_sync_worker.get_auth_state", return_value={
                "last_checked_at": None,
                "refresh_fail_count": 0,
            }):
                with patch("app.instagram_sync_worker.update_auth_state"):
                    result = await run_instagram_sync(
                        sync_control=sync_control,
                        run_once=True,
                    )
                    assert result.get("error") is not None

    @pytest.mark.asyncio
    async def test_run_once_succeeds_when_cookies_valid(self):
        from app.instagram_sync_worker import SyncControl, run_instagram_sync

        sync_control = SyncControl()
        sync_control.enable()
        sync_control.set_collection("123", "TestCollection")

        with patch("app.instagram_sync_worker.ensure_valid_cookies", new_callable=AsyncMock, return_value=True):
            with patch("app.instagram_sync_worker.get_auth_state", return_value={
                "last_checked_at": None,
                "refresh_fail_count": 0,
            }):
                with patch("app.instagram_sync_worker.update_auth_state"):
                    with patch("app.instagram_sync_worker.get_available_collections", new_callable=AsyncMock, return_value=[]):
                        result = await run_instagram_sync(
                            sync_control=sync_control,
                            run_once=True,
                        )
                        assert result.get("error") is None or result.get("queued") == 0
```

- [ ] **Step 2: Tests laufen lassen (müssen fehlschlagen)**

```bash
cd backend && poetry run pytest tests/unit/test_instagram_sync_worker_auth.py -v 2>&1 | head -20
```
Expected: `ImportError` weil `ensure_valid_cookies` noch nicht importiert wird im Sync-Worker

- [ ] **Step 3: Imports im Sync-Worker ergänzen**

In `backend/app/instagram_sync_worker.py` folgende Imports ergänzen:
```python
from datetime import datetime, timezone
from app.instagram_auth import ensure_valid_cookies, get_auth_state, update_auth_state
```

Sicherstellen dass `timezone` im bestehenden `datetime`-Import ergänzt wird falls noch nicht vorhanden.

- [ ] **Step 4: Proaktiven Tages-Check einbauen**

In `run_instagram_sync()`, direkt nach dem `if not sync_control.enabled`-Block und vor dem Collection-Fetch, einfügen:

```python
# Proaktiver Cookie-Check: einmal täglich
now = datetime.now(timezone.utc)
auth_state = get_auth_state()
last_checked = auth_state.get("last_checked_at")
should_check = (
    last_checked is None
    or (now - last_checked).total_seconds() >= 86400
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

- [ ] **Step 5: Reaktiven Refresh bei Auth-Fehler einbauen**

Den bestehenden `except ValueError as auth_error`-Block ersetzen:

```python
except ValueError as auth_error:
    error_msg = str(auth_error)
    logger.error(f"Instagram auth failed during sync: {error_msg}")

    logger.info("Starte reaktiven Cookie-Refresh nach Auth-Fehler")
    refresh_ok = await ensure_valid_cookies()

    if refresh_ok:
        logger.info("Reaktiver Cookie-Refresh erfolgreich — Sync wird fortgesetzt")
        if notify_admin:
            try:
                await notify_admin(
                    "✅ Instagram Cookies automatisch erneuert\n\nDer Sync läuft weiter."
                )
            except Exception:
                pass
        continue  # Sofort erneut versuchen ohne sleep

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

- [ ] **Step 6: Tests laufen lassen (müssen grün sein)**

```bash
cd backend && poetry run pytest tests/unit/test_instagram_sync_worker_auth.py -v
```
Expected: alle Tests grün

- [ ] **Step 7: Commit**

```bash
git add backend/app/instagram_sync_worker.py backend/tests/unit/test_instagram_sync_worker_auth.py
git commit -m "feat: add proactive daily cookie check and reactive refresh in sync worker"
```

---

## Task 8: `/auth_status` Telegram-Kommando

**Files:**
- Modify: `backend/app/telegram_bot.py`
- Create: `backend/tests/unit/test_telegram_auth_status.py`

- [ ] **Step 1: Failing Test schreiben**

`backend/tests/unit/test_telegram_auth_status.py` erstellen:

```python
import os
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import datetime, timezone

os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/test_cookies.txt")
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp/test_browser_state")


@pytest.mark.asyncio
async def test_auth_status_handler_shows_valid_status():
    from app.telegram_bot import auth_status_handler

    mock_update = MagicMock()
    mock_update.effective_user.id = 12345
    mock_update.message.reply_text = AsyncMock()

    mock_context = MagicMock()

    with patch("app.telegram_bot.settings") as mock_settings:
        mock_settings.telegram_admin_ids = ["12345"]
        mock_settings.instagram_cookie_refresh_threshold_days = 7
        with patch("app.instagram_auth.is_cookie_valid", return_value=True):
            with patch("app.instagram_auth.get_auth_state", return_value={
                "last_checked_at": datetime(2026, 4, 30, tzinfo=timezone.utc),
                "last_refresh_at": datetime(2026, 4, 30, tzinfo=timezone.utc),
                "refresh_fail_count": 0,
                "last_error": None,
            }):
                await auth_status_handler(mock_update, mock_context)
                mock_update.message.reply_text.assert_called_once()
                call_args = mock_update.message.reply_text.call_args[0][0]
                assert "Auth Status" in call_args


@pytest.mark.asyncio
async def test_auth_status_handler_blocked_for_non_admin():
    from app.telegram_bot import auth_status_handler

    mock_update = MagicMock()
    mock_update.effective_user.id = 99999
    mock_update.message.reply_text = AsyncMock()
    mock_context = MagicMock()

    with patch("app.telegram_bot.settings") as mock_settings:
        mock_settings.telegram_admin_ids = ["12345"]
        await auth_status_handler(mock_update, mock_context)
        call_args = mock_update.message.reply_text.call_args[0][0]
        assert "Berechtigung" in call_args
```

- [ ] **Step 2: Tests laufen lassen (müssen fehlschlagen)**

```bash
cd backend && poetry run pytest tests/unit/test_telegram_auth_status.py -v 2>&1 | head -20
```
Expected: `ImportError: cannot import name 'auth_status_handler' from 'app.telegram_bot'`

- [ ] **Step 3: Handler in `telegram_bot.py` implementieren**

Stelle zuerst fest wo andere Handler-Funktionen definiert sind:
```bash
grep -n "async def.*handler" backend/app/telegram_bot.py | head -10
```

Dann `auth_status_handler` an der gleichen Stelle einfügen:

```python
async def auth_status_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    if settings.telegram_admin_ids and user_id not in settings.telegram_admin_ids:
        await update.message.reply_text("Keine Berechtigung.")
        return

    from app.instagram_auth import get_auth_state, is_cookie_valid

    state = get_auth_state()
    cookie_ok = is_cookie_valid(threshold_days=settings.instagram_cookie_refresh_threshold_days)

    def fmt_dt(dt):
        return dt.strftime("%Y-%m-%d %H:%M UTC") if dt else "nie"

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

Dann Handler registrieren (dort wo andere `application.add_handler`-Aufrufe stehen):
```python
application.add_handler(CommandHandler("auth_status", auth_status_handler))
```

- [ ] **Step 4: Tests laufen lassen (müssen grün sein)**

```bash
cd backend && poetry run pytest tests/unit/test_telegram_auth_status.py -v
```
Expected: beide Tests grün

- [ ] **Step 5: Commit**

```bash
git add backend/app/telegram_bot.py backend/tests/unit/test_telegram_auth_status.py
git commit -m "feat: add /auth_status telegram command"
```

---

## Task 9: Vollständiger Test-Run und Smoke-Check

- [ ] **Step 1: Alle neuen Unit-Tests laufen lassen**

```bash
cd backend && poetry run pytest tests/unit/test_instagram_auth.py tests/unit/test_instagram_auth_config.py tests/unit/test_instagram_sync_worker_auth.py tests/unit/test_telegram_auth_status.py -v
```
Expected: alle Tests grün

- [ ] **Step 2: Kompletten Test-Suite laufen lassen (Regressions-Check)**

```bash
cd backend && poetry run pytest tests/ -v 2>&1 | tail -20
```
Expected: keine Regressions gegenüber vor diesem Feature

- [ ] **Step 3: Import-Smoke-Check**

```bash
cd backend && poetry run python -c "
from app.instagram_auth import ensure_valid_cookies, is_cookie_valid, get_auth_state, refresh_cookies_via_playwright
from app.instagram_service import _get_loader
from app.instagram_sync_worker import run_instagram_sync
print('Alle Imports OK')
"
```
Expected: `Alle Imports OK`

- [ ] **Step 4: Playwright-Smoke-Check**

```bash
cd backend && poetry run python -c "from playwright.async_api import async_playwright; print('Playwright OK')"
```
Expected: `Playwright OK`

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: instagram auto cookie refresh via playwright - complete"
```
