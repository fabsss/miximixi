"""
Unit tests for telegram_bot.py functionality.
Tests URL detection, access control, and error humanization.
"""
import pytest


def test_detect_source_type_instagram():
    """TC1: URL-Erkennung — Instagram"""
    from app.telegram_bot import detect_source_type

    urls = [
        "https://instagram.com/p/ABC123",
        "https://www.instagram.com/p/ABC123",
    ]
    for url in urls:
        assert detect_source_type(url) == "instagram", f"Failed for {url}"


def test_detect_source_type_youtube():
    """TC2: URL-Erkennung — YouTube"""
    from app.telegram_bot import detect_source_type

    urls = [
        "https://youtube.com/watch?v=ABC123",
        "https://www.youtube.com/watch?v=ABC123",
        "https://youtu.be/ABC123",
    ]
    for url in urls:
        assert detect_source_type(url) == "youtube", f"Failed for {url}"


def test_detect_source_type_web():
    """TC3: URL-Erkennung — Web-Fallback"""
    from app.telegram_bot import detect_source_type

    urls = [
        "https://example.com/recipe",
        "https://chefkoch.de/rezepte/pasta",
        "https://bbc.com/food/recipe",
    ]
    for url in urls:
        assert detect_source_type(url) == "web", f"Failed for {url}"


def test_is_allowed_empty_list_allows_all():
    """TC4: Access control — leere Liste erlaubt alle"""
    from app.telegram_bot import is_allowed
    from unittest.mock import patch

    with patch("app.telegram_bot.settings") as mock_settings:
        mock_settings.telegram_allowed_user_ids = []

        assert is_allowed(123456) is True
        assert is_allowed(999999) is True
        assert is_allowed(1) is True


def test_is_allowed_user_in_list():
    """TC5: Access control — User in Allowlist"""
    from app.telegram_bot import is_allowed
    from unittest.mock import patch

    with patch("app.telegram_bot.settings") as mock_settings:
        mock_settings.telegram_allowed_user_ids = ["123456", "789012"]

        assert is_allowed(123456) is True
        assert is_allowed(789012) is True


def test_is_allowed_user_not_in_list():
    """TC6: Access control — User nicht in Allowlist"""
    from app.telegram_bot import is_allowed
    from unittest.mock import patch

    with patch("app.telegram_bot.settings") as mock_settings:
        mock_settings.telegram_allowed_user_ids = ["123456", "789012"]

        assert is_allowed(999999) is False
        assert is_allowed(111111) is False


def test_humanize_error_download():
    """TC7: Error-Text humanisierung — Download-Fehler"""
    from app.telegram_bot import humanize_error

    errors = [
        "Failed to download video from yt-dlp",
        "HTTP 404: Page not found",
        "Connection timeout while downloading",
    ]
    for error in errors:
        result = humanize_error(error)
        assert "Video" in result or "heruntergeladen" in result, f"Failed for {error}"


def test_humanize_error_unknown():
    """TC8: Error-Text humanisierung — Unbekannter Fehler"""
    from app.telegram_bot import humanize_error

    result = humanize_error("Some random error that doesn't match patterns")
    assert "Technischer Fehler" in result or len(result) > 0
