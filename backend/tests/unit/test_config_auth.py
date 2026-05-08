import os
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp")
os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/c.txt")

def test_auth_config_defaults():
    from app.config import Settings
    # Temporarily remove keys that conftest.py sets globally to verify
    # the actual default values defined in the Settings model.
    overrides = {}
    for key in ("SECRET_KEY", "ENCRYPTION_KEY", "ADMIN_KEY"):
        if key in os.environ:
            overrides[key] = os.environ.pop(key)
    try:
        s = Settings()
        assert s.secret_key == ""
        assert s.encryption_key == ""
        assert s.telegram_bot_username == "miximixi_bot"
        assert s.admin_key == ""
    finally:
        os.environ.update(overrides)
