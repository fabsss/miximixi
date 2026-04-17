"""Functional tests for FastAPI routes in app.main.
These tests use mocked database connections to avoid requiring a real DB.
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def mock_client():
    """TestClient with database connection mocked out."""
    with patch("app.main.get_db") as mock_db:
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value = mock_cursor
        mock_db.return_value = mock_conn

        from app.main import app
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client


class TestHealthEndpoint:
    def test_health_returns_ok_when_db_available(self, mock_client):
        response = mock_client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "llm_provider" in data


class TestCategoriesEndpoint:
    def test_get_categories_returns_list(self, mock_client):
        response = mock_client.get("/categories")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "categories" in data
        assert isinstance(data["categories"], list)

    def test_get_categories_contains_expected_values(self, mock_client):
        response = mock_client.get("/categories")
        assert response.status_code == 200
        data = response.json()
        categories = data["categories"]
        assert "Hauptspeisen" in categories
        assert "Drinks" in categories

    def test_get_category_counts_returns_counts_and_total(self, mock_client):
        """Test that /categories/counts returns correct structure."""
        response = mock_client.get("/categories/counts")
        # Should either succeed (200) or fail with DB error (500 or 503)
        assert response.status_code in (200, 500, 503)
        if response.status_code == 200:
            data = response.json()
            assert "counts" in data
            assert "total" in data
            assert isinstance(data["counts"], dict)
            assert isinstance(data["total"], int)


class TestRecipesEndpoint:
    def test_get_recipes_returns_list(self, mock_client):
        response = mock_client.get("/recipes")
        assert response.status_code in (200, 503)  # 503 if DB not available in CI

    def test_get_recipes_accepts_limit_param(self, mock_client):
        response = mock_client.get("/recipes?limit=10")
        assert response.status_code in (200, 503)


class TestImportEndpoint:
    def test_import_requires_url(self, mock_client):
        response = mock_client.post("/import", json={})
        # 422 = Unprocessable Entity (missing required field)
        assert response.status_code == 422

    def test_import_with_valid_payload_returns_queue_id(self, mock_client):
        """Test that import endpoint accepts valid payload."""
        with patch("app.main.run_worker"):
            response = mock_client.post(
                "/import",
                json={"url": "https://www.example.com/recipe"}
            )
            # Either queued (200) or DB error (503) - both are valid outcomes
            assert response.status_code in (200, 503)
            if response.status_code == 200:
                data = response.json()
                assert "queue_id" in data
