import os
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app modules
os.environ.setdefault("LLM_PROVIDER", "ollama")
os.environ.setdefault("DATABASE_URL", "postgresql://miximixi:miximixi@localhost:5432/miximixi_test")


@pytest.fixture(scope="session")
def app():
    from app.main import app as fastapi_app
    return fastapi_app


@pytest.fixture(scope="session")
def client(app):
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def sample_recipe_payload():
    return {
        "url": "https://www.example.com/recipe/pasta",
        "notes": "Test recipe import",
    }
