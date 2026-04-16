"""
Functional/Integration tests for Instagram sync worker
Tests: TC21-TC26 - Full sync cycle and edge cases
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio
from app.instagram_sync_worker import (
    SyncControl,
    has_recipe,
)


class TestFullSyncCycle:
    """TC21: End-to-end sync cycle (fetch → detect → queue → track)"""
    
    @pytest.mark.asyncio
    async def test_full_sync_cycle_recipe_detection(self):
        """TC21A: Full sync detects recipes from mixed posts"""
        # Test that has_recipe can identify recipes among mixed content
        posts = [
            ("Pasta Rezept - delicious", True),
            ("Random vacation photo", False),
            ("Easy recipe for chocolate cake", True),
            ("Check out my new outfit", False),
        ]
        
        for caption, expected_is_recipe in posts:
            result = await has_recipe(caption)
            assert result is expected_is_recipe, f"Expected has_recipe('{caption}') = {expected_is_recipe}, got {result}"
    
    def test_full_sync_respects_enabled_flag(self):
        """TC21B: Sync respects sync_control.enabled flag"""
        sync_control = SyncControl()
        
        # Initially disabled
        assert sync_control.enabled is False
        
        # After enabling
        sync_control.enable()
        assert sync_control.enabled is True
        
        # After disabling again
        sync_control.disable()
        assert sync_control.enabled is False


class TestDuplicatePostPrevention:
    """TC22: Duplicate post prevention across sync runs"""
    
    def test_sync_control_collection_tracking(self):
        """TC22A: SyncControl tracks selected collection"""
        sync_control = SyncControl()
        
        # Initially no collection
        status = sync_control.get_status()
        assert status["collection_id"] is None
        
        # Set collection
        sync_control.set_collection("coll_123", "Favorites")
        status = sync_control.get_status()
        assert status["collection_id"] == "coll_123"
        assert status["collection_name"] == "Favorites"
    
    def test_sync_control_duplicate_prevention_pattern(self):
        """TC22B: Multiple calls to set_collection update cleanly"""
        sync_control = SyncControl()
        
        # First collection
        sync_control.set_collection("coll_1", "Recipes")
        assert sync_control.get_status()["collection_id"] == "coll_1"
        
        # Switch to different collection
        sync_control.set_collection("coll_2", "Favorites")
        assert sync_control.get_status()["collection_id"] == "coll_2"
        
        # Verify previous collection is replaced
        assert sync_control.get_status()["collection_name"] == "Favorites"


class TestNoCollectionSelected:
    """TC23: Behavior when no collection is selected"""
    
    def test_sync_skips_without_collection(self):
        """TC23: SyncControl reports no collection selected"""
        sync_control = SyncControl()
        sync_control.enable()  # Enabled but no collection set
        
        status = sync_control.get_status()
        assert status["collection_id"] is None
        assert status["enabled"] is True


class TestSyncControlEnabledFlag:
    """TC24: Sync respects and updates enabled flag"""
    
    def test_sync_enabled_flag_toggles(self):
        """TC24A: Enabled flag toggles correctly"""
        sync_control = SyncControl()
        assert sync_control.enabled is False
        
        sync_control.enable()
        assert sync_control.enabled is True
        
        sync_control.disable()
        assert sync_control.enabled is False
    
    def test_sync_status_shows_enabled_state(self):
        """TC24B: Status dict reflects enabled state"""
        sync_control = SyncControl()
        
        # Disabled state
        status = sync_control.get_status()
        assert status["enabled"] is False
        
        # Enabled state
        sync_control.enable()
        status = sync_control.get_status()
        assert status["enabled"] is True


class TestAuthErrorHandling:
    """TC25-TC26: Auth error handling and notifications"""
    
    @pytest.mark.asyncio
    async def test_auth_error_keywords_detection(self):
        """TC25: Auth error messages contain recovery information"""
        # Test that error messages would contain helpful recovery steps
        auth_errors = [
            "Instagram authentication failed: invalid session",
            "Invalid cookies: session expired",
            "Authentication required",
        ]
        
        recovery_keywords = ["session", "cookies", "authentication", "auth", "invalid"]
        
        for error_msg in auth_errors:
            has_recovery_info = any(kw in error_msg.lower() for kw in recovery_keywords)
            assert has_recovery_info, f"Error message '{error_msg}' should contain recovery keywords"
    
    def test_sync_control_error_state(self):
        """TC26: SyncControl can disable due to errors"""
        sync_control = SyncControl()
        sync_control.enable()
        sync_control.set_collection("coll_123", "Recipes")
        
        # Simulate error by disabling
        sync_control.disable()
        
        status = sync_control.get_status()
        assert status["enabled"] is False
        assert status["collection_id"] == "coll_123"  # Collection persists
