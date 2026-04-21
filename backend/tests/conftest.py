import os
import pytest
import tempfile
import sys
from pathlib import Path
from fastapi.testclient import TestClient

# Create temp directories FIRST (before any app imports)
_temp_root = tempfile.mkdtemp()
_images_dir = os.path.join(_temp_root, "recipe-images")
_tmp_dir = os.path.join(_temp_root, "miximixi")
os.makedirs(_images_dir, exist_ok=True)
os.makedirs(_tmp_dir, exist_ok=True)

# Set test environment variables BEFORE importing app modules
os.environ["LLM_PROVIDER"] = "ollama"
os.environ["DATABASE_URL"] = "postgresql://miximixi:miximixi@localhost:5432/miximixi_test"
os.environ["DB_HOST"] = "localhost"
os.environ["DB_PORT"] = "5432"
os.environ["DB_USER"] = "miximixi"
os.environ["DB_PASSWORD"] = "miximixi"
os.environ["DB_NAME"] = "miximixi_test"
os.environ["IMAGES_DIR"] = _images_dir
os.environ["TMP_DIR"] = _tmp_dir

# Disable Telegram bot in tests — prevents real polling sessions that cause
# 409 Conflict on the production server. Settings loads ../../.env which
# contains the real bot token, and TestClient runs the full lifespan.
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["INSTAGRAM_SYNC_ENABLED"] = "false"

# Force reload of app modules to pick up environment variables
if "app.config" in sys.modules:
    del sys.modules["app.config"]
if "app.main" in sys.modules:
    del sys.modules["app.main"]


@pytest.fixture(scope="session")
def temp_dirs():
    """Return temporary directories for tests"""
    return {
        "images_dir": _images_dir,
        "tmp_dir": _tmp_dir,
    }


@pytest.fixture(scope="session")
def app():
    """Create FastAPI app with temporary directories for testing"""
    from app.main import app as fastapi_app
    return fastapi_app


@pytest.fixture(scope="session")
def client(app):
    """Create TestClient with proper directory setup"""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def sample_recipe_payload():
    return {
        "url": "https://www.example.com/recipe/pasta",
        "notes": "Test recipe import",
    }
