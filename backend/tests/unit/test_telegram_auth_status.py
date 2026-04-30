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
        with patch("app.telegram_bot.get_auth_state", return_value={
            "last_checked_at": datetime(2026, 4, 30, tzinfo=timezone.utc),
            "last_refresh_at": datetime(2026, 4, 30, tzinfo=timezone.utc),
            "refresh_fail_count": 0,
            "last_error": None,
        }):
            with patch("app.telegram_bot.is_cookie_valid", return_value=True):
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
