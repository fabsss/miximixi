import os
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp")
os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/c.txt")

def test_auth_config_defaults():
    from app.config import Settings
    s = Settings()
    assert s.secret_key == ""
    assert s.encryption_key == ""
    assert s.telegram_bot_username == "miximixi_bot"
    assert s.admin_key == ""
