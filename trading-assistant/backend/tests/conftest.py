"""Shared test setup. Configures an isolated DB + fixed secret before app import."""

import os
import tempfile
from pathlib import Path

# Must be set BEFORE importing app modules (config reads env at import time).
# Force an empty value so the dev .env (real tokens) can't leak into tests.
_TMP = Path(tempfile.mkdtemp())
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP / 'test.db'}"
os.environ["MENTOR_SECRET_KEY"] = "test-secret-key"
for _k in ("ANTHROPIC_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME",
           "STRIPE_SECRET_KEY", "STRIPE_PRICE_ID", "METAAPI_TOKEN"):
    os.environ[_k] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import ratelimit  # noqa: E402
from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    ratelimit._BUCKETS.clear()  # isolate rate-limit state between tests
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth(client):
    """Register a fresh user and return (client, headers)."""
    r = client.post(
        "/api/auth/register",
        json={"email": "t@example.com", "password": "secret123"},
    )
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    return client, {"Authorization": f"Bearer {token}"}
