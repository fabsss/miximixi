import os
os.environ.setdefault("INSTAGRAM_BROWSER_STATE_DIR", "/tmp")
os.environ.setdefault("INSTAGRAM_COOKIES_FILE", "/tmp/c.txt")

import pytest
from unittest.mock import patch
from cryptography.fernet import Fernet, InvalidToken
from app.crypto import encrypt_password, decrypt_password

TEST_KEY = Fernet.generate_key().decode()


def test_encrypt_decrypt_roundtrip():
    with patch("app.crypto.settings") as mock_settings:
        mock_settings.encryption_key = TEST_KEY
        ciphertext = encrypt_password("secret123")
        assert isinstance(ciphertext, bytes)
        assert decrypt_password(ciphertext) == "secret123"


def test_encrypt_produces_different_ciphertext_each_time():
    with patch("app.crypto.settings") as mock_settings:
        mock_settings.encryption_key = TEST_KEY
        a = encrypt_password("same")
        b = encrypt_password("same")
        assert a != b


def test_decrypt_raises_on_tampered_data():
    with patch("app.crypto.settings") as mock_settings:
        mock_settings.encryption_key = TEST_KEY
        ciphertext = encrypt_password("secret")
        tampered = ciphertext[:-4] + b"xxxx"
        with pytest.raises(InvalidToken):
            decrypt_password(tampered)
