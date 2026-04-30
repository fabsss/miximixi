import os
import logging
import pytest
from unittest.mock import patch, MagicMock

os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/test_cookies.txt")
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp/test_browser_state")


def test_get_loader_logs_warning_when_cookie_invalid(caplog):
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
