"""
Tests for auth endpoints in app.main:
  POST /auth/register
  POST /auth/login
  GET  /auth/me
  POST /auth/telegram-link-code
  GET  /auth/telegram-links
  DELETE /auth/telegram-links/{id}

All DB calls are mocked via monkeypatch on app.main.get_db so no real
database is needed.
"""
import os
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp")
os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/c.txt")

import pytest
import bcrypt
import psycopg2
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

# --- helpers ------------------------------------------------------------------

TEST_SECRET = "testsecret1234567890abcdef123456"
TEST_ADMIN_KEY = "test-admin-key-abc123"
TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000"
TEST_EMAIL = "user@example.com"
TEST_DISPLAY_NAME = "user"


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=4)).decode()


def _make_mock_db(fetchone_return=None, fetchall_return=None, rowcount=1):
    """
    Build a minimal psycopg2-connection mock that covers the context-manager
    cursor pattern used in main.py:

        with db.cursor(cursor_factory=...) as cur:
            cur.execute(...)
            row = cur.fetchone()
    """
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_cursor.fetchone.return_value = fetchone_return
    mock_cursor.fetchall.return_value = fetchall_return if fetchall_return is not None else []
    mock_cursor.rowcount = rowcount

    # Support "with db.cursor(...) as cur:" — __enter__ returns the cursor
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    return mock_conn, mock_cursor


# --- fixtures -----------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    from app.main import app
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture()
def valid_token():
    """A real JWT signed with TEST_SECRET for TEST_USER_ID."""
    with patch("app.auth.settings") as mock_settings:
        mock_settings.secret_key = TEST_SECRET
        from app.auth import create_access_token
        return create_access_token(TEST_USER_ID)


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ===========================================================================
# POST /auth/register
# ===========================================================================

class TestRegisterEndpoint:

    def test_register_success(self, client, monkeypatch):
        """Admin can create a user; returns id/email/display_name."""
        returned_row = {
            "id": TEST_USER_ID,
            "email": TEST_EMAIL,
            "display_name": TEST_DISPLAY_NAME,
        }
        mock_conn, mock_cursor = _make_mock_db(fetchone_return=returned_row)
        monkeypatch.setattr("app.main.get_db", lambda: mock_conn)

        with patch("app.main.settings") as mock_settings:
            mock_settings.admin_key = TEST_ADMIN_KEY
            # Also keep other settings attributes intact
            mock_settings.telegram_bot_username = "testbot"
            response = client.post(
                "/auth/register",
                json={"email": TEST_EMAIL, "password": "secure123", "display_name": TEST_DISPLAY_NAME},
                headers={"X-Admin-Key": TEST_ADMIN_KEY},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == TEST_EMAIL
        assert "id" in data

    def test_register_missing_admin_key_returns_403(self, client, monkeypatch):
        """Request without X-Admin-Key header returns 403."""
        with patch("app.main.settings") as mock_settings:
            mock_settings.admin_key = TEST_ADMIN_KEY
            mock_settings.telegram_bot_username = "testbot"
            response = client.post(
                "/auth/register",
                json={"email": TEST_EMAIL, "password": "pw"},
                # No X-Admin-Key header
            )
        assert response.status_code == 403

    def test_register_wrong_admin_key_returns_403(self, client, monkeypatch):
        """Wrong X-Admin-Key returns 403."""
        with patch("app.main.settings") as mock_settings:
            mock_settings.admin_key = TEST_ADMIN_KEY
            mock_settings.telegram_bot_username = "testbot"
            response = client.post(
                "/auth/register",
                json={"email": TEST_EMAIL, "password": "pw"},
                headers={"X-Admin-Key": "wrong-key"},
            )
        assert response.status_code == 403

    def test_register_duplicate_email_returns_409(self, client, monkeypatch):
        """Duplicate e-mail raises UniqueViolation → 409 Conflict."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_cursor.execute.side_effect = psycopg2.errors.UniqueViolation("duplicate key")
        mock_conn.cursor.return_value = mock_cursor
        monkeypatch.setattr("app.main.get_db", lambda: mock_conn)

        with patch("app.main.settings") as mock_settings:
            mock_settings.admin_key = TEST_ADMIN_KEY
            mock_settings.telegram_bot_username = "testbot"
            response = client.post(
                "/auth/register",
                json={"email": TEST_EMAIL, "password": "pw"},
                headers={"X-Admin-Key": TEST_ADMIN_KEY},
            )
        assert response.status_code == 409


# ===========================================================================
# POST /auth/login
# ===========================================================================

class TestLoginEndpoint:

    def _user_row(self, is_active=True, password="secret"):
        return {
            "id": TEST_USER_ID,
            "email": TEST_EMAIL,
            "password_hash": _hash(password),
            "display_name": TEST_DISPLAY_NAME,
            "is_active": is_active,
        }

    def test_login_success_returns_token(self, client, monkeypatch):
        """Valid credentials return access_token + user object."""
        mock_conn, mock_cursor = _make_mock_db(fetchone_return=self._user_row())
        monkeypatch.setattr("app.main.get_db", lambda: mock_conn)

        with patch("app.main.settings") as mock_settings:
            mock_settings.secret_key = TEST_SECRET
            mock_settings.telegram_bot_username = "testbot"
            with patch("app.auth.settings") as auth_settings:
                auth_settings.secret_key = TEST_SECRET
                response = client.post(
                    "/auth/login",
                    json={"email": TEST_EMAIL, "password": "secret"},
                )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == TEST_EMAIL

    def test_login_wrong_password_returns_401(self, client, monkeypatch):
        """Wrong password → 401 (not 403)."""
        mock_conn, mock_cursor = _make_mock_db(fetchone_return=self._user_row(password="correctpassword"))
        monkeypatch.setattr("app.main.get_db", lambda: mock_conn)

        with patch("app.main.settings") as mock_settings:
            mock_settings.telegram_bot_username = "testbot"
            response = client.post(
                "/auth/login",
                json={"email": TEST_EMAIL, "password": "wrongpassword"},
            )
        assert response.status_code == 401

    def test_login_nonexistent_user_returns_401(self, client, monkeypatch):
        """Unknown e-mail → 401 (same as wrong password, no enumeration)."""
        mock_conn, mock_cursor = _make_mock_db(fetchone_return=None)
        monkeypatch.setattr("app.main.get_db", lambda: mock_conn)

        with patch("app.main.settings") as mock_settings:
            mock_settings.telegram_bot_username = "testbot"
            response = client.post(
                "/auth/login",
                json={"email": "nobody@nowhere.com", "password": "pw"},
            )
        assert response.status_code == 401

    def test_login_disabled_account_returns_401(self, client, monkeypatch):
        """is_active=False → 401 (not 403, to prevent enumeration)."""
        mock_conn, mock_cursor = _make_mock_db(fetchone_return=self._user_row(is_active=False))
        monkeypatch.setattr("app.main.get_db", lambda: mock_conn)

        with patch("app.main.settings") as mock_settings:
            mock_settings.telegram_bot_username = "testbot"
            response = client.post(
                "/auth/login",
                json={"email": TEST_EMAIL, "password": "secret"},
            )
        assert response.status_code == 401


# ===========================================================================
# GET /auth/me
# ===========================================================================

class TestGetMeEndpoint:

    def test_get_me_success(self, client, monkeypatch, valid_token):
        """Valid JWT → 200 with user data."""
        user_row = {
            "id": TEST_USER_ID,
            "email": TEST_EMAIL,
            "display_name": TEST_DISPLAY_NAME,
            "created_at": "2024-01-01T00:00:00",
        }
        mock_conn, mock_cursor = _make_mock_db(fetchone_return=user_row)
        monkeypatch.setattr("app.main.get_db", lambda: mock_conn)

        with patch("app.auth.settings") as auth_settings:
            auth_settings.secret_key = TEST_SECRET
            response = client.get(
                "/auth/me",
                headers=auth_headers(valid_token),
            )

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == TEST_EMAIL

    def test_get_me_no_token_returns_401(self, client):
        """No Authorization header → 401."""
        response = client.get("/auth/me")
        assert response.status_code == 401

    def test_get_me_invalid_token_returns_401(self, client):
        """Garbage token → 401."""
        response = client.get(
            "/auth/me",
            headers={"Authorization": "Bearer this.is.garbage"},
        )
        assert response.status_code == 401

    def test_get_me_user_not_in_db_returns_404(self, client, monkeypatch, valid_token):
        """Valid token but user deleted from DB → 404."""
        mock_conn, mock_cursor = _make_mock_db(fetchone_return=None)
        monkeypatch.setattr("app.main.get_db", lambda: mock_conn)

        with patch("app.auth.settings") as auth_settings:
            auth_settings.secret_key = TEST_SECRET
            response = client.get(
                "/auth/me",
                headers=auth_headers(valid_token),
            )
        assert response.status_code == 404


# ===========================================================================
# POST /auth/telegram-link-code
# ===========================================================================

class TestTelegramLinkCodeEndpoint:

    def test_create_link_code_success(self, client, monkeypatch, valid_token):
        """Authenticated user gets a link code."""
        mock_conn, mock_cursor = _make_mock_db()
        monkeypatch.setattr("app.main.get_db", lambda: mock_conn)

        with patch("app.auth.settings") as auth_settings:
            auth_settings.secret_key = TEST_SECRET
            with patch("app.main.settings") as main_settings:
                main_settings.telegram_bot_username = "miximixibot"
                response = client.post(
                    "/auth/telegram-link-code",
                    headers=auth_headers(valid_token),
                )

        assert response.status_code == 200
        data = response.json()
        assert data["code"].startswith("MIX-")
        assert "miximixibot" in data["deep_link"]
        assert data["expires_in"] == 300

    def test_create_link_code_requires_auth(self, client):
        """No token → 401."""
        response = client.post("/auth/telegram-link-code")
        assert response.status_code == 401

    def test_create_link_code_inserts_into_db(self, client, monkeypatch, valid_token):
        """The endpoint calls db.cursor().execute() at least once (INSERT)."""
        mock_conn, mock_cursor = _make_mock_db()
        monkeypatch.setattr("app.main.get_db", lambda: mock_conn)

        with patch("app.auth.settings") as auth_settings:
            auth_settings.secret_key = TEST_SECRET
            with patch("app.main.settings") as main_settings:
                main_settings.telegram_bot_username = "miximixibot"
                client.post(
                    "/auth/telegram-link-code",
                    headers=auth_headers(valid_token),
                )

        mock_cursor.execute.assert_called_once()
        call_sql = mock_cursor.execute.call_args[0][0]
        assert "telegram_link_codes" in call_sql


# ===========================================================================
# GET /auth/telegram-links
# ===========================================================================

class TestListTelegramLinksEndpoint:

    def test_list_telegram_links_empty(self, client, monkeypatch, valid_token):
        """Returns empty list when no links exist."""
        mock_conn, mock_cursor = _make_mock_db(fetchall_return=[])
        monkeypatch.setattr("app.main.get_db", lambda: mock_conn)

        with patch("app.auth.settings") as auth_settings:
            auth_settings.secret_key = TEST_SECRET
            response = client.get(
                "/auth/telegram-links",
                headers=auth_headers(valid_token),
            )

        assert response.status_code == 200
        assert response.json() == []

    def test_list_telegram_links_with_data(self, client, monkeypatch, valid_token):
        """Returns links when they exist."""
        links = [
            {
                "telegram_user_id": 123456,
                "telegram_username": "johndoe",
                "linked_at": "2024-01-01T12:00:00",
            }
        ]
        mock_conn, mock_cursor = _make_mock_db(fetchall_return=links)
        monkeypatch.setattr("app.main.get_db", lambda: mock_conn)

        with patch("app.auth.settings") as auth_settings:
            auth_settings.secret_key = TEST_SECRET
            response = client.get(
                "/auth/telegram-links",
                headers=auth_headers(valid_token),
            )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["telegram_username"] == "johndoe"

    def test_list_telegram_links_requires_auth(self, client):
        """No token → 401."""
        response = client.get("/auth/telegram-links")
        assert response.status_code == 401


# ===========================================================================
# DELETE /auth/telegram-links/{telegram_user_id}
# ===========================================================================

class TestUnlinkTelegramEndpoint:

    def test_unlink_success(self, client, monkeypatch, valid_token):
        """Existing link gets deleted → 200 {"ok": true}."""
        mock_conn, mock_cursor = _make_mock_db(rowcount=1)
        monkeypatch.setattr("app.main.get_db", lambda: mock_conn)

        with patch("app.auth.settings") as auth_settings:
            auth_settings.secret_key = TEST_SECRET
            response = client.delete(
                "/auth/telegram-links/123456",
                headers=auth_headers(valid_token),
            )

        assert response.status_code == 200
        assert response.json()["ok"] is True

    def test_unlink_nonexistent_returns_404(self, client, monkeypatch, valid_token):
        """rowcount=0 (nothing deleted) → 404."""
        mock_conn, mock_cursor = _make_mock_db(rowcount=0)
        monkeypatch.setattr("app.main.get_db", lambda: mock_conn)

        with patch("app.auth.settings") as auth_settings:
            auth_settings.secret_key = TEST_SECRET
            response = client.delete(
                "/auth/telegram-links/999999",
                headers=auth_headers(valid_token),
            )

        assert response.status_code == 404

    def test_unlink_requires_auth(self, client):
        """No token → 401."""
        response = client.delete("/auth/telegram-links/123456")
        assert response.status_code == 401
