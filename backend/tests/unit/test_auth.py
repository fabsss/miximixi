import os
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp")
os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/c.txt")

import pytest
from unittest.mock import patch
from app.auth import create_access_token, verify_token

TEST_SECRET = "testsecret1234567890abcdef123456"
TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000"


def test_create_and_verify_token():
    with patch("app.auth.settings") as mock_settings:
        mock_settings.secret_key = TEST_SECRET
        token = create_access_token(TEST_USER_ID)
        assert isinstance(token, str)
        user_id = verify_token(token)
        assert user_id == TEST_USER_ID


def test_verify_raises_on_invalid_token():
    with patch("app.auth.settings") as mock_settings:
        mock_settings.secret_key = TEST_SECRET
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            verify_token("not.a.valid.token")
        assert exc_info.value.status_code == 401


def test_verify_raises_on_wrong_secret():
    with patch("app.auth.settings") as mock_settings:
        mock_settings.secret_key = TEST_SECRET
        token = create_access_token(TEST_USER_ID)
    with patch("app.auth.settings") as mock_settings:
        mock_settings.secret_key = "wrong_secret_key_abcdef1234567890"
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            verify_token(token)
