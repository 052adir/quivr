"""Download endpoint for the desktop watcher."""


def test_requires_auth(client):
    assert client.get("/api/download/watcher").status_code == 401


def test_returns_zip_or_unavailable(auth):
    client, headers = auth
    r = client.get("/api/download/watcher", headers=headers)
    # 200 (exe built on this machine) or 503 (not built, e.g. CI) — never 500.
    assert r.status_code in (200, 503)
    if r.status_code == 200:
        assert r.content[:2] == b"MZ"  # Windows .exe magic — single file, no zip
