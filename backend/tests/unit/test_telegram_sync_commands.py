"""
Tests for Telegram bot Instagram sync commands
Tests: TC9-TC20 - Admin command handlers
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from telegram import Update, User, Chat, Message
from telegram.ext import ContextTypes
from app.telegram_bot import (
    is_admin,
    sync_status_handler,
    sync_enable_handler,
    sync_disable_handler,
    sync_setup_handler,
    sync_now_handler,
)


@pytest.fixture
def mock_update_admin():
    """Create a mock Update from admin user"""
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 123456789
    update.message = AsyncMock()
    update.message.reply_text = AsyncMock()
    return update


@pytest.fixture
def mock_update_user():
    """Create a mock Update from non-admin user"""
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 999999999
    update.message = AsyncMock()
    update.message.reply_text = AsyncMock()
    return update


@pytest.fixture
def mock_context_with_sync():
    """Create a mock ContextTypes with sync_control"""
    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    from app.instagram_sync_worker import SyncControl
    sync_control = SyncControl()
    sync_control.set_collection("coll_123", "Favorite Recipes")
    context.bot_data = {"sync_control": sync_control}
    return context


class TestIsAdminFunction:
    """TC9: Admin access control for sync commands"""
    
    def test_is_admin_with_matching_id(self):
        """TC9A: is_admin() returns True for users in TELEGRAM_ADMIN_IDS"""
        with patch("app.telegram_bot.settings.telegram_admin_ids", ["123456789"]):
            assert is_admin(123456789) is True
    
    def test_is_admin_with_non_matching_id(self):
        """TC9B: is_admin() returns False for users not in admin list"""
        with patch("app.telegram_bot.settings.telegram_admin_ids", ["123456789"]):
            assert is_admin(999999999) is False
    
    def test_is_admin_with_empty_list(self):
        """TC9C: is_admin() returns False when no admins configured"""
        with patch("app.telegram_bot.settings.telegram_admin_ids", []):
            assert is_admin(123456789) is False


class TestSyncStatusHandler:
    """TC10: /sync_status command"""
    
    @pytest.mark.asyncio
    async def test_sync_status_denies_non_admin(self, mock_update_user):
        """TC10A: /sync_status requires admin user"""
        context = MagicMock()
        
        with patch("app.telegram_bot.is_admin", return_value=False):
            await sync_status_handler(mock_update_user, context)
            
            mock_update_user.message.reply_text.assert_called_once()
            call_text = mock_update_user.message.reply_text.call_args[0][0]
            assert "Admin" in call_text
    
    @pytest.mark.asyncio
    async def test_sync_status_shows_state(self, mock_update_admin, mock_context_with_sync):
        """TC10B: /sync_status shows enabled/disabled + collection"""
        with patch("app.telegram_bot.is_admin", return_value=True):
            await sync_status_handler(mock_update_admin, mock_context_with_sync)
            
            mock_update_admin.message.reply_text.assert_called_once()
            call_text = mock_update_admin.message.reply_text.call_args[0][0]
            assert "Status" in call_text or "✅" in call_text or "Aktiv" in call_text


class TestSyncEnableHandler:
    """TC11: /sync_enable command"""
    
    @pytest.mark.asyncio
    async def test_sync_enable_denies_non_admin(self, mock_update_user):
        """TC11A: /sync_enable requires admin user"""
        context = MagicMock()
        
        with patch("app.telegram_bot.is_admin", return_value=False):
            await sync_enable_handler(mock_update_user, context)
            
            mock_update_user.message.reply_text.assert_called_once()
            call_text = mock_update_user.message.reply_text.call_args[0][0]
            assert "Admin" in call_text
    
    @pytest.mark.asyncio
    async def test_sync_enable_sets_enabled_true(self, mock_update_admin, mock_context_with_sync):
        """TC11B: /sync_enable enables sync and confirms"""
        with patch("app.telegram_bot.is_admin", return_value=True):
            mock_context_with_sync.bot_data["sync_control"].disable()
            await sync_enable_handler(mock_update_admin, mock_context_with_sync)
            
            assert mock_context_with_sync.bot_data["sync_control"].enabled is True
            mock_update_admin.message.reply_text.assert_called_once()
            call_text = mock_update_admin.message.reply_text.call_args[0][0]
            assert "aktiviert" in call_text.lower() or "✅" in call_text


class TestSyncDisableHandler:
    """TC12: /sync_disable command"""
    
    @pytest.mark.asyncio
    async def test_sync_disable_denies_non_admin(self, mock_update_user):
        """TC12A: /sync_disable requires admin user"""
        context = MagicMock()
        
        with patch("app.telegram_bot.is_admin", return_value=False):
            await sync_disable_handler(mock_update_user, context)
            
            mock_update_user.message.reply_text.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_sync_disable_sets_enabled_false(self, mock_update_admin, mock_context_with_sync):
        """TC12B: /sync_disable disables sync and confirms"""
        with patch("app.telegram_bot.is_admin", return_value=True):
            await sync_disable_handler(mock_update_admin, mock_context_with_sync)
            
            assert mock_context_with_sync.bot_data["sync_control"].enabled is False
            mock_update_admin.message.reply_text.assert_called_once()


class TestSyncSetupHandler:
    """TC13-16: /sync_setup command and collection selection"""
    
    @pytest.mark.asyncio
    async def test_sync_setup_denies_non_admin(self, mock_update_user):
        """TC13: /sync_setup requires admin user"""
        context = MagicMock()
        
        with patch("app.telegram_bot.is_admin", return_value=False):
            await sync_setup_handler(mock_update_user, context)
            
            mock_update_user.message.reply_text.assert_called_once()
            call_text = mock_update_user.message.reply_text.call_args[0][0]
            assert "Admin" in call_text
    
    @pytest.mark.asyncio
    async def test_sync_setup_shows_error_when_no_collections(self, mock_update_admin, mock_context_with_sync):
        """TC14: /sync_setup shows error when no collections available"""
        with patch("app.telegram_bot.is_admin", return_value=True):
            with patch("app.instagram_sync_worker.get_available_collections", return_value=[]):
                await sync_setup_handler(mock_update_admin, mock_context_with_sync)
                
                mock_update_admin.message.reply_text.assert_called()
                call_text = str(mock_update_admin.message.reply_text.call_args)
                assert "❌" in call_text or "Keine" in call_text or "not found" in call_text.lower()
    
    @pytest.mark.asyncio
    async def test_sync_setup_shows_auth_error(self, mock_update_admin, mock_context_with_sync):
        """TC15: /sync_setup shows recovery steps on auth failure"""
        with patch("app.telegram_bot.is_admin", return_value=True):
            auth_error = ValueError("Instagram authentication failed: cookies expired")
            with patch("app.instagram_sync_worker.get_available_collections", side_effect=auth_error):
                await sync_setup_handler(mock_update_admin, mock_context_with_sync)
                
                mock_update_admin.message.reply_text.assert_called()
                call_text = str(mock_update_admin.message.reply_text.call_args)
                # Should include recovery steps
                assert "cookies" in call_text.lower() or "authentif" in call_text.lower()


class TestSyncNowHandler:
    """TC17-20: /sync_now manual sync trigger"""
    
    @pytest.mark.asyncio
    async def test_sync_now_denies_non_admin(self, mock_update_user):
        """TC17: /sync_now requires admin user"""
        context = MagicMock()
        
        with patch("app.telegram_bot.is_admin", return_value=False):
            await sync_now_handler(mock_update_user, context)
            
            mock_update_user.message.reply_text.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_sync_now_error_no_collection_selected(self, mock_update_admin):
        """TC18: /sync_now shows error if no collection selected"""
        context = MagicMock()
        from app.instagram_sync_worker import SyncControl
        context.bot_data = {"sync_control": SyncControl()}  # No collection selected
        
        with patch("app.telegram_bot.is_admin", return_value=True):
            await sync_now_handler(mock_update_admin, context)
            
            mock_update_admin.message.reply_text.assert_called()
            call_text = str(mock_update_admin.message.reply_text.call_args)
            assert "❌" in call_text or "nicht" in call_text.lower() or "no collection" in call_text.lower()
    
    @pytest.mark.asyncio
    async def test_sync_now_shows_stats(self, mock_update_admin, mock_context_with_sync):
        """TC19: /sync_now shows sync stats"""
        with patch("app.telegram_bot.is_admin", return_value=True):
            mock_stats = {
                "queued": 3,
                "skipped": 2,
                "errors": 0,
                "total_posts": 15,
            }
            with patch("app.instagram_sync_worker.run_instagram_sync", return_value=mock_stats):
                await sync_now_handler(mock_update_admin, mock_context_with_sync)
                
                mock_update_admin.message.reply_text.assert_called()
                call_text = str(mock_update_admin.message.reply_text.call_args)
                assert "3" in call_text  # queued count
                assert "Sync" in call_text or "abgeschlossen" in call_text.lower()
    
    @pytest.mark.asyncio
    async def test_sync_now_shows_auth_error(self, mock_update_admin, mock_context_with_sync):
        """TC20: /sync_now shows recovery steps on auth failure"""
        with patch("app.telegram_bot.is_admin", return_value=True):
            auth_error = ValueError("Instagram authentication failed")
            with patch("app.instagram_sync_worker.run_instagram_sync", side_effect=auth_error):
                await sync_now_handler(mock_update_admin, mock_context_with_sync)
                
                mock_update_admin.message.reply_text.assert_called()
                call_text = str(mock_update_admin.message.reply_text.call_args)
                assert "Authentif" in call_text or "cookies" in call_text.lower() or "❌" in call_text
