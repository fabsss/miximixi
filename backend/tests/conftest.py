import os
import pytest
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import patch

# Set test environment variables before importing app modules
os.environ.setdefault("LLM_PROVIDER", "ollama")
os.environ.setdefault("DATABASE_URL", "postgresql://miximixi:miximixi@localhost:5432/miximixi_test")


@pytest.fixture(scope="session")
def temp_dirs():
    """Create temporary directories for tests"""
    with tempfile.TemporaryDirectory() as tmpdir:
        images_dir = Path(tmpdir) / "recipe-images"
        images_dir.mkdir(parents=True, exist_ok=True)
        
        tmp_dir = Path(tmpdir) / "miximixi"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        
        yield {
            "images_dir": str(images_dir),
            "tmp_dir": str(tmp_dir),
        }


@pytest.fixture(scope="session")
def app(temp_dirs):
    """Create FastAPI app with temporary directories for testing"""
    # Patch settings before importing app
    with patch("app.config.settings.images_dir", temp_dirs["images_dir"]), \
         patch("app.config.settings.tmp_dir", temp_dirs["tmp_dir"]):
        from app.main import app as fastapi_app
        return fastapi_app


@pytest.fixture(scope="session")
def client(app, temp_dirs):
    """Create TestClient with proper directory setup"""
    with patch("app.config.settings.images_dir", temp_dirs["images_dir"]), \
         patch("app.config.settings.tmp_dir", temp_dirs["tmp_dir"]):
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c


@pytest.fixture
def sample_recipe_payload():
    return {
        "url": "https://www.example.com/recipe/pasta",
        "notes": "Test recipe import",
    }
