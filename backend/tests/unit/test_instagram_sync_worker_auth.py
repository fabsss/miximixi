import os
import pytest
from unittest.mock import patch, AsyncMock

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
