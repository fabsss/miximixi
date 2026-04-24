import pytest
from unittest.mock import MagicMock


@pytest.fixture
def mock_og_client(client, monkeypatch):
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor

    def mock_get_db():
        return mock_conn

    monkeypatch.setattr("app.main.get_db", mock_get_db)
    return client, mock_cursor


class TestOgEndpoint:
    def test_valid_slug_returns_200(self, mock_og_client):
        client, mock_cursor = mock_og_client
        mock_cursor.fetchone.return_value = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "title": "Rhabarberkuchen mit Baiser",
            "category": "Backen",
            "prep_time": "30 Minuten",
            "image_filename": "550e8400-e29b-41d4-a716-446655440000.jpg",
        }
        response = client.get("/og/recipes/rhabarberkuchen-mit-baiser-550e8400-e29b-41d4-a716-446655440000")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/html")

    def test_og_title_in_response(self, mock_og_client):
        client, mock_cursor = mock_og_client
        mock_cursor.fetchone.return_value = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "title": "Rhabarberkuchen mit Baiser",
            "category": "Backen",
            "prep_time": "30 Minuten",
            "image_filename": "550e8400-e29b-41d4-a716-446655440000.jpg",
        }
        response = client.get("/og/recipes/rhabarberkuchen-550e8400-e29b-41d4-a716-446655440000")
        assert "Rhabarberkuchen mit Baiser" in response.text
        assert 'property="og:title"' in response.text

    def test_og_image_url_in_response(self, mock_og_client):
        client, mock_cursor = mock_og_client
        mock_cursor.fetchone.return_value = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "title": "Testkuchen",
            "category": "Backen",
            "prep_time": None,
            "image_filename": "cover.jpg",
        }
        response = client.get("/og/recipes/testkuchen-550e8400-e29b-41d4-a716-446655440000")
        assert "/images/550e8400-e29b-41d4-a716-446655440000" in response.text
        assert 'property="og:image"' in response.text

    def test_redirect_meta_tag_in_response(self, mock_og_client):
        client, mock_cursor = mock_og_client
        mock_cursor.fetchone.return_value = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "title": "Testkuchen",
            "category": None,
            "prep_time": None,
            "image_filename": None,
        }
        response = client.get("/og/recipes/testkuchen-550e8400-e29b-41d4-a716-446655440000")
        assert "http-equiv=\"refresh\"" in response.text

    def test_invalid_slug_returns_404(self, mock_og_client):
        client, mock_cursor = mock_og_client
        mock_cursor.fetchone.return_value = None
        response = client.get("/og/recipes/nicht-vorhanden-00000000-0000-0000-0000-000000000000")
        assert response.status_code == 404
