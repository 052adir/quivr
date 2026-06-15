"""EA webhook ingestion: live alerts from MetaTrader become app alerts."""


def _token(client, email="ea_user@t.com"):
    return client.post(
        "/api/auth/register", json={"email": email, "password": "secret123"}
    ).json()["token"]


def test_ea_event_creates_alert(client):
    tok = _token(client)
    r = client.post("/api/ea/event", json={
        "token": tok, "type": "no_stop_loss", "symbol": "XAUUSD",
        "ref": "12345", "message": "פתחת XAUUSD בלי stop-loss",
    })
    assert r.status_code == 200
    alerts = client.get("/api/alerts", headers={"Authorization": f"Bearer {tok}"}).json()
    assert any(a["type"] == "no_stop_loss" and a["symbol"] == "XAUUSD" for a in alerts)


def test_ea_event_dedup(client):
    tok = _token(client, "ea_dup@t.com")
    body = {"token": tok, "type": "no_stop_loss", "symbol": "EURUSD",
            "ref": "999", "message": "x"}
    assert client.post("/api/ea/event", json=body).status_code == 200
    second = client.post("/api/ea/event", json=body).json()
    assert second.get("duplicate") is True


def test_ea_event_bad_token(client):
    r = client.post("/api/ea/event", json={
        "token": "nope", "type": "no_stop_loss", "message": "x",
    })
    assert r.status_code == 401
