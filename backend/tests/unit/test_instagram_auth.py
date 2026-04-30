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
