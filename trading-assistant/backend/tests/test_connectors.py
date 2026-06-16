"""Multi-platform connector layer: routing, demo feed, validation."""

from types import SimpleNamespace

import pytest

from app import connectors


def _conn(**kw):
    base = dict(provider="demo", meta_enc="", api_key_enc="", api_secret_enc="", symbols="")
    base.update(kw)
    return SimpleNamespace(**base)


def test_supported_providers():
    # MT5 is intentionally not a server-side connector (its login() hijacks the
    # terminal); it is handled by the in-terminal EA instead.
    assert set(connectors.SUPPORTED_PROVIDERS) >= {"demo", "binance", "ccxt"}
    assert "mt5" not in connectors.SUPPORTED_PROVIDERS


def test_demo_returns_fills():
    res = connectors.fetch(_conn(provider="demo"))
    assert len(res.fills) > 0
    assert res.round_trips == []


def test_unknown_provider_raises():
    with pytest.raises(connectors.ConnectorError):
        connectors.fetch(_conn(provider="does-not-exist"))


def test_verify_demo_is_noop():
    connectors.verify(_conn(provider="demo"))  # must not raise


def test_fetchresult_defaults():
    r = connectors.FetchResult()
    assert r.fills == [] and r.round_trips == []


def test_connect_rejects_unknown_provider(auth):
    client, headers = auth
    r = client.post(
        "/api/connections", headers=headers, json={"provider": "bogus", "api_key": "x"}
    )
    assert r.status_code == 400


def test_connect_demo_via_provider(auth):
    client, headers = auth
    r = client.post("/api/connections", headers=headers, json={"provider": "demo"})
    assert r.status_code == 200
    assert r.json()["provider"] == "demo"
    assert r.json()["new_trades"] > 0


def test_two_demo_users_no_dedup_collision(client):
    # Demo data is deterministic -> identical dedup keys across users. The
    # per-user unique constraint must allow both to connect.
    for email in ["u1@t.com", "u2@t.com"]:
        tok = client.post(
            "/api/auth/register", json={"email": email, "password": "secret123"}
        ).json()["token"]
        r = client.post(
            "/api/connections",
            headers={"Authorization": f"Bearer {tok}"},
            json={"provider": "demo"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["new_alerts"] > 0
