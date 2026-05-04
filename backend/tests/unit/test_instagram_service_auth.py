import os
import pytest
from unittest.mock import patch, MagicMock

os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/test_cookies.txt")
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp/test_browser_state")


def test_get_loader_raises_when_session_file_missing(tmp_path):
    with patch("app.instagram_service.settings") as mock_settings:
        mock_settings.instagram_browser_state_dir = str(tmp_path)
        mock_settings.instagram_username = "testuser"
        from app.instagram_service import _get_loader
        try:
            _get_loader()
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "Session" in str(e) or "session" in str(e)


def test_get_loader_raises_when_session_file_invalid(tmp_path):
    session_file = tmp_path / "session-testuser"
    session_file.write_bytes(b"invalid pickle data")
    with patch("app.instagram_service.settings") as mock_settings:
        mock_settings.instagram_browser_state_dir = str(tmp_path)
        mock_settings.instagram_username = "testuser"
        from app.instagram_service import _get_loader
        try:
            _get_loader()
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "ungültig" in str(e) or "invalid" in str(e).lower() or "Session" in str(e)
