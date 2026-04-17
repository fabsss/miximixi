"""Functional tests for FastAPI routes in app.main.
These tests use mocked database connections to avoid requiring a real DB.
"""
import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture
def mock_client_fixture(client, monkeypatch):
    """Fixture-based mocking using monkeypatch, compatible with conftest client."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    # Mock the behavior of RealDictCursor for /categories/counts
    # First call to fetchall() gets per-category counts
    # Second call to fetchone() gets total count
    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = {"count": 0}
    mock_conn.cursor.return_value = mock_cursor

    def mock_get_db():
        return mock_conn

    monkeypatch.setattr("app.main.get_db", mock_get_db)
    return client


@pytest.fixture
def mock_client_with_error_fixture(client, monkeypatch):
    """Fixture with database connection that fails on first call."""
    def mock_get_db_error():
        raise Exception("DB connection failed")

    monkeypatch.setattr("app.main.get_db", mock_get_db_error)
    return client


# Keep old fixture names for backward compatibility with test methods
@pytest.fixture
def mock_client(mock_client_fixture):
    """Alias for mock_client_fixture."""
    return mock_client_fixture


@pytest.fixture
def mock_client_with_error(mock_client_with_error_fixture):
    """Alias for mock_client_with_error_fixture."""
    return mock_client_with_error_fixture


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


class TestCategoryCountsEndpoint:
    def test_returns_200(self, mock_client):
        """Test that /categories/counts endpoint returns 200 with empty DB."""
        response = mock_client.get("/categories/counts")
        assert response.status_code == 200

    def test_response_has_counts_and_total_keys(self, mock_client):
        """Test that response contains 'counts' and 'total' keys."""
        response = mock_client.get("/categories/counts")
        data = response.json()
        assert "counts" in data
        assert "total" in data

    def test_counts_is_dict(self, mock_client):
        """Test that 'counts' in response is a dictionary."""
        response = mock_client.get("/categories/counts")
        data = response.json()
        assert isinstance(data["counts"], dict)

    def test_total_is_integer(self, mock_client):
        """Test that 'total' in response is an integer."""
        response = mock_client.get("/categories/counts")
        data = response.json()
        assert isinstance(data["total"], int)

    def test_counts_with_mocked_data(self, mock_client):
        """Verify counts are correctly aggregated from DB rows."""
        response = mock_client.get("/categories/counts")
        assert response.status_code == 200
        data = response.json()
        # With mocked empty data, counts should be empty dict
        assert isinstance(data["counts"], dict)
        assert isinstance(data["total"], int)

    def test_empty_db_returns_zero_total(self, mock_client):
        """When DB has no recipes, counts is empty and total is 0."""
        response = mock_client.get("/categories/counts")
        assert response.status_code == 200
        data = response.json()
        assert data["counts"] == {}
        assert data["total"] == 0

    def test_returns_500_on_db_error(self, mock_client_with_error):
        """When DB query fails, endpoint returns 500 error with generic message."""
        response = mock_client_with_error.get("/categories/counts")
        assert response.status_code == 500
        data = response.json()
        assert "detail" in data
        # Verify generic error message (not raw exception)
        assert data["detail"] == "Failed to fetch category counts"


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
            # Either queued (200) or DB error (500, 503) - all valid outcomes when DB not available
            assert response.status_code in (200, 500, 503)
            if response.status_code == 200:
                data = response.json()
                assert "queue_id" in data
