"""
Integration tests for shortcode-based deduplication.
Verify that recipes with different URL formats are correctly deduplicated.
"""
import pytest
from app.source_identifier import extract_source_id, get_source_type_from_url


class TestDeduplicationScenarios:
    """Test real-world duplicate scenarios"""

    def test_instagram_post_utm_variations(self):
        """Same Instagram post with different UTM parameters should have same shortcode"""
        url1 = "https://www.instagram.com/p/ABC123XYZ/"
        url2 = "https://www.instagram.com/p/ABC123XYZ/?utm_source=ig_web_copy_link"
        url3 = "https://www.instagram.com/p/ABC123XYZ/?utm_medium=share_sheet"

        # All should extract the same shortcode
        assert extract_source_id(url1) == extract_source_id(url2) == extract_source_id(url3)
        assert extract_source_id(url1) == "ABC123XYZ"

    def test_instagram_shorthand_vs_full_domain(self):
        """instagr.am shorthand and www.instagram.com should have same shortcode"""
        url1 = "https://www.instagram.com/p/ABC123XYZ/"
        url2 = "https://instagr.am/p/ABC123XYZ/"

        assert extract_source_id(url1) == extract_source_id(url2) == "ABC123XYZ"
        assert get_source_type_from_url(url1) == get_source_type_from_url(url2) == "instagram"

    def test_youtube_timestamp_variations(self):
        """YouTube URLs with different timestamps should have same video ID"""
        url1 = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        url2 = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"
        url3 = "https://youtu.be/dQw4w9WgXcQ?t=42"

        assert extract_source_id(url1) == extract_source_id(url2) == extract_source_id(url3)
        assert extract_source_id(url1) == "dQw4w9WgXcQ"

    def test_web_urls_have_no_shortcode(self):
        """Web URLs don't have platform-specific shortcodes"""
        url = "https://example.com/recipe/pasta"
        assert extract_source_id(url) is None
        assert get_source_type_from_url(url) == "web"

    def test_source_type_consistency(self):
        """Source type should be consistent across URL variations"""
        instagram_urls = [
            "https://www.instagram.com/p/ABC123/",
            "https://instagr.am/p/ABC123/",
            "https://www.instagram.com/p/ABC123/?utm_source=ig_web_copy_link",
        ]

        for url in instagram_urls:
            assert get_source_type_from_url(url) == "instagram"

        youtube_urls = [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
        ]

        for url in youtube_urls:
            assert get_source_type_from_url(url) == "youtube"
