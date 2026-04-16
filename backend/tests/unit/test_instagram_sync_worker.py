"""
Unit tests for instagram_sync_worker.py
Tests: TC1-TC8 - Core sync worker functions
"""
import pytest
import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from app.instagram_sync_worker import (
    SyncControl,
    has_recipe,
    detect_new_posts,
    queue_recipe_imports,
)


class TestSyncControl:
    """SyncControl state management"""
    
    def test_sync_control_initial_state(self):
        """TC0: SyncControl initializes with correct defaults"""
        control = SyncControl()
        assert control.enabled is False
        assert control.selected_collection_id is None
        assert control.selected_collection_name is None
        assert control.last_status == {}
    
    def test_enable_sets_enabled_true(self):
        """TC0A: enable() sets enabled flag to True"""
        control = SyncControl()
        control.disable()
        assert control.enabled is False
        control.enable()
        assert control.enabled is True
    
    def test_disable_sets_enabled_false(self):
        """TC0B: disable() sets enabled flag to False"""
        control = SyncControl()
        control.enable()
        assert control.enabled is True
        control.disable()
        assert control.enabled is False
    
    def test_set_collection_updates_collection(self):
        """TC0C: set_collection() updates both ID and name"""
        control = SyncControl()
        result = control.set_collection("12345", "My Collection")
        
        assert result is True
        assert control.selected_collection_id == "12345"
        assert control.selected_collection_name == "My Collection"
    
    def test_get_status_returns_dict(self):
        """TC0D: get_status() returns current status as dict"""
        control = SyncControl()
        control.set_collection("123", "Test")
        
        status = control.get_status()
        
        assert isinstance(status, dict)
        assert status["enabled"] is False
        assert status["collection_id"] == "123"
        assert status["collection_name"] == "Test"


class TestHasRecipe:
    """TC1-3: Recipe detection heuristic"""
    
    @pytest.mark.asyncio
    async def test_has_recipe_german_keywords(self):
        """TC1: has_recipe() detects German recipe keywords"""
        # Rezept
        assert await has_recipe("Heute: Rezept für Pasta") is True
        
        # Zutat
        assert await has_recipe("Zutaten: Mehl, Eier, Zucker") is True
        
        # Schritt/Anleitung
        assert await has_recipe("Anleitung: Schritt 1...") is True
    
    @pytest.mark.asyncio
    async def test_has_recipe_english_keywords(self):
        """TC2: has_recipe() detects English recipe keywords"""
        assert await has_recipe("Easy recipe for chocolate cake") is True
        assert await has_recipe("Ingredients: flour, sugar") is True
        assert await has_recipe("Bake for 30 minutes") is True
    
    @pytest.mark.asyncio
    async def test_has_recipe_non_recipe_caption(self):
        """TC3: has_recipe() returns False for non-recipe text"""
        assert await has_recipe("Check out my new outfit!") is False
        assert await has_recipe("Beautiful sunset today") is False
        assert await has_recipe("") is False
        # Note: has_recipe should handle None gracefully
        # assert await has_recipe(None) is False


@pytest.mark.asyncio
class TestDetectNewPosts:
    """TC4-5: New post detection"""
    
    async def test_detect_new_posts_empty_list(self):
        """TC4: detect_new_posts() returns empty list for no posts"""
        result = await detect_new_posts("coll_123", [])
        assert result == []
    
    async def test_detect_new_posts_all_new(self):
        """TC5: detect_new_posts() returns all posts when none in DB"""
        posts = [
            {"post_id": "post1", "caption": "Rezept", "url": "https://..."},
            {"post_id": "post2", "caption": "Rezept", "url": "https://..."},
        ]
        
        with patch("app.instagram_sync_worker.get_db_connection") as mock_db:
            # Mock cursor returns no existing posts
            mock_cursor = MagicMock()
            mock_cursor.fetchall.return_value = []
            mock_db.return_value.cursor.return_value = mock_cursor
            
            result = await detect_new_posts("coll_123", posts)
            
            assert len(result) == 2
            assert result[0]["post_id"] == "post1"
    
    async def test_detect_new_posts_filters_duplicates(self):
        """TC6: detect_new_posts() skips posts already in DB"""
        posts = [
            {"post_id": "post1", "caption": "Rezept", "url": "https://..."},
            {"post_id": "post2", "caption": "Rezept", "url": "https://..."},
            {"post_id": "post3", "caption": "Rezept", "url": "https://..."},
        ]
        
        with patch("app.instagram_sync_worker.get_db_connection") as mock_db:
            # Mock cursor returns that post1 and post3 already exist
            mock_cursor = MagicMock()
            mock_cursor.fetchall.return_value = [
                {"post_id": "post1"},
                {"post_id": "post3"},
            ]
            mock_db.return_value.cursor.return_value = mock_cursor
            
            result = await detect_new_posts("coll_123", posts)
            
            # Only post2 should be returned (new)
            assert len(result) == 1
            assert result[0]["post_id"] == "post2"


@pytest.mark.asyncio
class TestQueueRecipeImports:
    """TC6-7: Recipe import queueing"""
    
    async def test_queue_recipe_imports_empty_posts(self):
        """TC6: queue_recipe_imports() handles empty list"""
        with patch("app.instagram_sync_worker.get_db_connection") as mock_db:
            mock_cursor = MagicMock()
            mock_db.return_value.cursor.return_value = mock_cursor
            
            result = await queue_recipe_imports("coll_123", [])
            
            assert result["queued"] == 0
            assert result["skipped"] == 0
    
    async def test_queue_recipe_imports_skips_non_recipes(self):
        """TC7: queue_recipe_imports() skips posts without recipe keywords"""
        posts = [
            {"post_id": "post1", "caption": "Check out my car!", "url": "https://..."},
            {"post_id": "post2", "caption": "Beautiful sunset", "url": "https://..."},
        ]
        
        with patch("app.instagram_sync_worker.get_db_connection") as mock_db:
            mock_cursor = MagicMock()
            mock_db.return_value.cursor.return_value = mock_cursor
            
            result = await queue_recipe_imports("coll_123", posts)
            
            assert result["skipped"] == 2
            assert result["queued"] == 0
    
    async def test_queue_recipe_imports_queues_recipes(self):
        """TC8: queue_recipe_imports() queues posts with recipes"""
        posts = [
            {"post_id": "post1", "caption": "Rezept für Pasta", "url": "https://insta.com/p/abc/"},
            {"post_id": "post2", "caption": "Einfaches Kuchen Rezept", "url": "https://insta.com/p/def/"},
        ]
        
        with patch("app.instagram_sync_worker.get_db_connection") as mock_db:
            mock_cursor = MagicMock()
            mock_cursor.fetchone.side_effect = [
                {"id": "job1"},  # First INSERT RETURNING
                {"id": "job2"},  # Second INSERT RETURNING
            ]
            mock_db.return_value.cursor.return_value = mock_cursor
            
            result = await queue_recipe_imports("coll_123", posts)
            
            assert result["queued"] == 2
            assert result["skipped"] == 0
            assert result["errors"] == 0
            
            # Verify INSERT calls
            assert mock_cursor.execute.call_count >= 4  # 2 INSERTs into queue + 2 into sync_state
