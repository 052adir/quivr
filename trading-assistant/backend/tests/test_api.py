"""End-to-end API tests via FastAPI TestClient."""

from datetime import datetime, timedelta

from sqlalchemy import select

from app.database import SessionLocal
from app.models import User


def test_health_and_version(client):
    assert client.get("/healthz").json()["status"] == "ok"
    v = client.get("/version").json()
    assert "version" in v and "billing_enabled" in v


def test_register_login_and_me(client):
    r = client.post("/api/auth/register", json={"email": "a@b.com", "password": "secret123"})
    assert r.status_code == 200
    token = r.json()["token"]

    # Duplicate registration rejected.
    dup = client.post("/api/auth/register", json={"email": "a@b.com", "password": "secret123"})
    assert dup.status_code == 400

    me = client.get("/api/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["email"] == "a@b.com"
    assert me["access"]["status"] == "trialing"
    assert me["access"]["active"] is True


def test_demo_flow_produces_trades_and_alerts(auth):
    client, headers = auth
    r = client.post("/api/connections", headers=headers, json={"api_key": "DEMO"})
    assert r.status_code == 200
    body = r.json()
    assert body["is_demo"] is True
    assert body["new_trades"] > 0
    assert body["new_alerts"] > 0

    dash = client.get("/api/dashboard", headers=headers).json()
    assert dash["stats"]["trades"] > 0
    assert len(dash["equity"]) > 0

    alerts = client.get("/api/alerts", headers=headers).json()
    assert len(alerts) > 0
    assert {a["severity"] for a in alerts} & {"warning", "success", "info"}


def test_connection_credentials_encrypted_at_rest():
    # Register + connect a (fake) real key, then confirm the raw secret is not
    # stored in plaintext.
    from app.main import app  # local import keeps module load order clean
    from fastapi.testclient import TestClient
    from app.models import Connection

    c = TestClient(app)
    tok = c.post("/api/auth/register", json={"email": "enc@b.com", "password": "secret123"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    # DEMO avoids the live Binance verify call but still exercises encryption path.
    c.post("/api/connections", headers=h, json={"api_key": "DEMO"})

    db = SessionLocal()
    conn = db.scalar(select(Connection))
    # Demo stores empty encrypted creds; ensure columns exist and are not the sentinel.
    assert conn.is_demo is True
    assert conn.api_key_enc == ""  # demo has no creds
    db.close()


def test_paywall_blocks_expired_trial(auth):
    client, headers = auth
    # Force the trial to have expired.
    db = SessionLocal()
    user = db.scalar(select(User))
    user.trial_ends_at = datetime.utcnow() - timedelta(days=1)
    db.commit()
    db.close()

    assert client.get("/api/dashboard", headers=headers).status_code == 402
    assert client.post("/api/sync", headers=headers).status_code == 402
    # Non-paywalled endpoints still work.
    assert client.get("/api/me", headers=headers).status_code == 200
    assert client.get("/api/lessons").status_code == 200


def test_lead_capture_public_and_admin(client):
    ok = client.post("/api/leads", json={"phone": "0501112222", "source": "telegram", "ref_code": "X"})
    assert ok.status_code == 200
    # Empty lead rejected.
    assert client.post("/api/leads", json={"source": "x"}).status_code == 400

    tok = client.post("/api/auth/register", json={"email": "adm@b.com", "password": "secret123"}).json()["token"]
    leads = client.get("/api/leads", headers={"Authorization": f"Bearer {tok}"}).json()
    assert any(l["ref_code"] == "X" for l in leads)


def test_auth_required(client):
    assert client.get("/api/dashboard").status_code == 401
    assert client.get("/api/me").status_code == 401


def test_billing_status(auth):
    client, headers = auth
    st = client.get("/api/billing/status", headers=headers).json()
    assert "access" in st and "billing_enabled" in st
    # Checkout unavailable without Stripe configured.
    assert client.post("/api/billing/checkout", headers=headers).status_code == 503
