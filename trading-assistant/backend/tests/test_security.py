"""Encryption-at-rest and password hashing."""

from app import crypto, security


def test_encrypt_roundtrip():
    secret = "super-secret-api-key-123"
    token = crypto.encrypt(secret)
    assert token != secret  # actually encrypted
    assert crypto.decrypt(token) == secret


def test_encrypt_empty():
    assert crypto.encrypt("") == ""
    assert crypto.decrypt("") == ""


def test_decrypt_garbage_fails_closed():
    assert crypto.decrypt("not-a-valid-token") == ""


def test_password_hash_and_verify():
    h = security.hash_password("hunter2")
    assert h != "hunter2"
    assert security.verify_password("hunter2", h)
    assert not security.verify_password("wrong", h)


def test_tokens_unique():
    assert security.new_token() != security.new_token()
