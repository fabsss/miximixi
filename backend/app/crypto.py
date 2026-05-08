from cryptography.fernet import Fernet
from app.config import settings


def _fernet() -> Fernet:
    if not settings.encryption_key:
        raise RuntimeError("ENCRYPTION_KEY not configured")
    return Fernet(settings.encryption_key.encode() if isinstance(settings.encryption_key, str) else settings.encryption_key)


def encrypt_password(plaintext: str) -> bytes:
    return _fernet().encrypt(plaintext.encode())


def decrypt_password(ciphertext: bytes) -> str:
    return _fernet().decrypt(ciphertext).decode()
