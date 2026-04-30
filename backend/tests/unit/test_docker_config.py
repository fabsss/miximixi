import os


def test_dockerfile_installs_playwright():
    with open("Dockerfile") as f:
        dockerfile = f.read()
    assert "playwright install chromium" in dockerfile


def test_docker_compose_has_browser_state_volume():
    with open("../docker-compose.yml") as f:
        compose = f.read()
    assert "instagram_browser_state" in compose


def test_docker_compose_has_updated_cookies_volume():
    with open("../docker-compose.yml") as f:
        compose = f.read()
    assert "/mnt/data/miximixi/instagram_cookies.txt" in compose
