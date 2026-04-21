import pytest
from app.source_identifier import extract_source_id, get_source_type_from_url


class TestExtractSourceId:
    """Test shortcode extraction from various URL formats"""

    def test_instagram_post_standard_url(self):
        """Standard Instagram post URL"""
        url = "https://www.instagram.com/p/ABC123XYZ/"
        assert extract_source_id(url) == "ABC123XYZ"

    def test_instagram_post_with_utm_params(self):
        """Instagram URL with UTM tracking parameters"""
        url = "https://www.instagram.com/p/ABC123XYZ/?utm_source=ig_web_copy_link"
        assert extract_source_id(url) == "ABC123XYZ"

    def test_instagram_shorthand_domain(self):
        """Instagram shorthand domain"""
        url = "https://instagr.am/p/ABC123XYZ/"
        assert extract_source_id(url) == "ABC123XYZ"

    def test_instagram_reel(self):
        """Instagram Reel URL"""
        url = "https://www.instagram.com/reel/ABC123XYZ/"
        assert extract_source_id(url) == "ABC123XYZ"

    def test_youtube_standard_url(self):
        """Standard YouTube video URL"""
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        assert extract_source_id(url) == "dQw4w9WgXcQ"

    def test_youtube_with_timestamp(self):
        """YouTube URL with timestamp parameter"""
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"
        assert extract_source_id(url) == "dQw4w9WgXcQ"

    def test_youtube_short_url(self):
        """YouTube short URL"""
        url = "https://youtu.be/dQw4w9WgXcQ"
        assert extract_source_id(url) == "dQw4w9WgXcQ"

    def test_youtube_short_with_timestamp(self):
        """YouTube short URL with timestamp"""
        url = "https://youtu.be/dQw4w9WgXcQ?t=42"
        assert extract_source_id(url) == "dQw4w9WgXcQ"

    def test_web_url_returns_none(self):
        """Web URLs (non-Instagram/YouTube) return None"""
        url = "https://example.com/recipe"
        assert extract_source_id(url) is None

    def test_invalid_instagram_url(self):
        """Invalid Instagram URL returns None"""
        url = "https://www.instagram.com/invalid/"
        assert extract_source_id(url) is None

    def test_invalid_youtube_url(self):
        """Invalid YouTube URL returns None"""
        url = "https://www.youtube.com/invalid"
        assert extract_source_id(url) is None


class TestGetSourceTypeFromUrl:
    """Test source type detection"""

    def test_instagram_com(self):
        """Detects instagram.com"""
        assert get_source_type_from_url("https://www.instagram.com/p/ABC123/") == "instagram"

    def test_instagr_am(self):
        """Detects instagr.am shorthand"""
        assert get_source_type_from_url("https://instagr.am/p/ABC123/") == "instagram"

    def test_youtube_com(self):
        """Detects youtube.com"""
        assert get_source_type_from_url("https://www.youtube.com/watch?v=ABC") == "youtube"

    def test_youtu_be(self):
        """Detects youtu.be shorthand"""
        assert get_source_type_from_url("https://youtu.be/ABC") == "youtube"

    def test_web_default(self):
        """Unknown URLs default to 'web'"""
        assert get_source_type_from_url("https://example.com/recipe") == "web"
