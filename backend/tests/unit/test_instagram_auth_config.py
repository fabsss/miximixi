import os
import pytest

os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/test_cookies.txt")
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp/test_browser_state")
os.environ.setdefault("INSTAGRAM_COOKIE_REFRESH_THRESHOLD_DAYS", "7")
os.environ.setdefault("INSTAGRAM_COOKIE_MAX_REFRESH_RETRIES", "2")
os.environ.setdefault("INSTAGRAM_COOKIE_RETRY_INTERVAL", "1800")


def test_config_has_browser_state_dir():
    from app.config import Settings
    s = Settings()
    assert hasattr(s, "instagram_browser_state_dir")


def test_config_has_refresh_threshold():
    from app.config import Settings
    s = Settings()
    assert hasattr(s, "instagram_cookie_refresh_threshold_days")
    assert isinstance(s.instagram_cookie_refresh_threshold_days, int)


def test_config_has_max_retries():
    from app.config import Settings
    s = Settings()
    assert hasattr(s, "instagram_cookie_max_refresh_retries")
    assert s.instagram_cookie_max_refresh_retries >= 1


def test_config_has_retry_interval():
    from app.config import Settings
    s = Settings()
    assert hasattr(s, "instagram_cookie_retry_interval")
    assert s.instagram_cookie_retry_interval > 0
