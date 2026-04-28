import pytest
from unittest.mock import MagicMock


@pytest.fixture
def mock_density_client(client, monkeypatch):
    """Mock database client for ingredient densities tests."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor

    def mock_get_db():
        return mock_conn

    monkeypatch.setattr("app.main.get_db", mock_get_db)
    return client, mock_cursor


class TestIngredientDensitiesEndpoint:
    def test_returns_list(self, mock_density_client):
        client, mock_cursor = mock_density_client
        mock_cursor.fetchall.return_value = [
            {
                "type_name": "flour",
                "display_name": "Mehl / Flour",
                "density_g_per_ml": 0.593,
                "keywords": ["mehl", "weizenmehl", "flour"],
            }
        ]
        response = client.get("/ingredient-densities")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1

    def test_response_schema(self, mock_density_client):
        client, mock_cursor = mock_density_client
        mock_cursor.fetchall.return_value = [
            {
                "type_name": "sugar",
                "display_name": "Zucker / Sugar",
                "density_g_per_ml": 0.845,
                "keywords": ["zucker", "sugar"],
            }
        ]
        response = client.get("/ingredient-densities")
        assert response.status_code == 200
        item = response.json()[0]
        assert "type_name" in item
        assert "display_name" in item
        assert "density_g_per_ml" in item
        assert "keywords" in item
        assert isinstance(item["keywords"], list)

    def test_empty_db_returns_empty_list(self, mock_density_client):
        client, mock_cursor = mock_density_client
        mock_cursor.fetchall.return_value = []
        response = client.get("/ingredient-densities")
        assert response.status_code == 200
        assert response.json() == []
