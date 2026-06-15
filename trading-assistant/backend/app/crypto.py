"""Encryption-at-rest for sensitive data (exchange API keys/secrets).

Uses Fernet (AES-128-CBC + HMAC). The key is derived from MENTOR_SECRET_KEY;
if that isn't set, a stable key is generated once and persisted to
backend/.secret_key so dev restarts keep working. In production, always set
MENTOR_SECRET_KEY (and keep it out of source control).
"""

import base64
import hashlib
import secrets
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from .config import settings

_SECRET_FILE = Path(__file__).resolve().parent.parent / ".secret_key"


def _resolve_secret() -> str:
    if settings.secret_key:
        return settings.secret_key
    if _SECRET_FILE.exists():
        return _SECRET_FILE.read_text().strip()
    # Dev convenience: generate and persist a stable secret.
    generated = secrets.token_hex(32)
    try:
        _SECRET_FILE.write_text(generated)
    except OSError:
        pass
    return generated


def _fernet() -> Fernet:
    digest = hashlib.sha256(_resolve_secret().encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        # Wrong/rotated key — fail closed rather than leak a stale value.
        return ""
