"""EA -> backend MT5 history push (feeds the dashboard/diagnosis, no server login)."""


def _token(client, email="mt5sync@t.com"):
    return client.post(
        "/api/auth/register", json={"email": email, "password": "secret123"}
    ).json()["token"]


def _trip(key, pnl=50.0, sym="XAUUSD"):
    return {
        "symbol": sym, "qty": 0.1, "entry_price": 2000.0, "exit_price": 2010.0,
        "entry_time": 1_750_000_000, "exit_time": 1_750_003_600, "pnl": pnl,
        "dedup_key": key,
    }


def test_ingest_and_dashboard(client):
    tok = _token(client)
    h = {"Authorization": f"Bearer {tok}"}
    r = client.post("/api/mt5/trades", json={"token": tok, "trips": [
        _trip("mt5|1", 100.0), _trip("mt5|2", -40.0),
    ]})
    assert r.status_code == 200 and r.json()["stored"] == 2

    dash = client.get("/api/dashboard", headers=h).json()
    assert dash["stats"]["trades"] == 2

    dx = client.get("/api/diagnosis", headers=h).json()
    assert dx["stats"]["trades"] == 2


def test_dedup(client):
    tok = _token(client, "mt5dup@t.com")
    body = {"token": tok, "trips": [_trip("mt5|9")]}
    assert client.post("/api/mt5/trades", json=body).json()["stored"] == 1
    assert client.post("/api/mt5/trades", json=body).json()["stored"] == 0


def test_bad_token(client):
    r = client.post("/api/mt5/trades", json={"token": "nope", "trips": [_trip("mt5|1")]})
    assert r.status_code == 401
