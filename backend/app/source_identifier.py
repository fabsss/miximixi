"""
Source identifier extraction for deduplication.
Normalizes URLs to extract platform-specific identifiers (shortcodes, video IDs, etc.)
"""
import re
from typing import Optional
from urllib.parse import urlparse, parse_qs


def get_source_type_from_url(url: str) -> str:
    """
    Detect source type from URL.

    Args:
        url: Full URL from import request

    Returns:
        "instagram" | "youtube" | "web"
    """
    url_lower = url.lower()

    if "instagram.com" in url_lower or "instagr.am" in url_lower:
        return "instagram"

    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        return "youtube"

    return "web"


def extract_source_id(url: str) -> Optional[str]:
    """
    Extract platform-specific identifier (shortcode, video ID, etc.) from URL.

    Handles:
    - Instagram posts/reels: extracts shortcode from /p/{SHORTCODE}/ or /reel/{SHORTCODE}/
    - YouTube: extracts video ID from watch?v={ID} or youtu.be/{ID}
    - Web URLs: returns None (full URL is the identifier)

    Args:
        url: Full URL from import request

    Returns:
        Shortcode (Instagram) or video ID (YouTube) or None (web)
    """
    source_type = get_source_type_from_url(url)

    if source_type == "instagram":
        return _extract_instagram_shortcode(url)
    elif source_type == "youtube":
        return _extract_youtube_id(url)

    return None


def _extract_instagram_shortcode(url: str) -> Optional[str]:
    """
    Extract Instagram shortcode from URL.
    Handles: /p/{SHORTCODE}/, /reel/{SHORTCODE}/, /tv/{SHORTCODE}/

    Shortcodes are alphanumeric, typically 11 characters but can vary.
    """
    # Remove query parameters and fragments first
    base_url = url.split('?')[0].split('#')[0]

    # Match /p/, /reel/, or /tv/ followed by shortcode
    match = re.search(r'/(p|reel|tv)/([A-Za-z0-9_-]+)/', base_url)
    if match:
        return match.group(2)

    return None


def _extract_youtube_id(url: str) -> Optional[str]:
    """
    Extract YouTube video ID from URL.
    Handles: youtube.com/watch?v={ID} and youtu.be/{ID}

    Video IDs are exactly 11 characters, alphanumeric with - and _.
    """
    # Remove fragment
    base_url = url.split('#')[0]

    # youtu.be/{ID}
    match = re.search(r'youtu\.be/([A-Za-z0-9_-]{11})', base_url)
    if match:
        return match.group(1)

    # youtube.com/watch?v={ID}
    parsed = urlparse(base_url)
    if 'youtube.com' in parsed.netloc or 'youtube.com' in base_url.lower():
        params = parse_qs(parsed.query)
        if 'v' in params and params['v']:
            video_id = params['v'][0]
            if len(video_id) == 11 and re.match(r'^[A-Za-z0-9_-]{11}$', video_id):
                return video_id

    return None
