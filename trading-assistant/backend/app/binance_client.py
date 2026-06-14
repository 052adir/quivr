"""Minimal read-only Binance REST client (no third-party SDK).

Only signed GET endpoints we actually need: account + myTrades. The API key the
user pastes must be *read-only* — this client never places or cancels orders.
"""

import hashlib
import hmac
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx

BASE_URL = "https://api.binance.com"


class BinanceError(RuntimeError):
    pass


class BinanceClient:
    def __init__(self, api_key: str, api_secret: str):
        self._api_key = api_key
        self._api_secret = api_secret.encode()

    def _signed_get(self, path: str, params: dict) -> object:
        params = {**params, "timestamp": int(time.time() * 1000), "recvWindow": 10000}
        query = urlencode(params)
        signature = hmac.new(self._api_secret, query.encode(), hashlib.sha256).hexdigest()
        url = f"{BASE_URL}{path}?{query}&signature={signature}"
        headers = {"X-MBX-APIKEY": self._api_key}
        try:
            resp = httpx.get(url, headers=headers, timeout=15)
        except httpx.HTTPError as exc:  # network failure
            raise BinanceError(f"network error talking to Binance: {exc}") from exc
        if resp.status_code != 200:
            raise BinanceError(f"Binance {resp.status_code}: {resp.text}")
        return resp.json()

    def verify(self) -> None:
        """Raise if the key is invalid; confirms it's at least readable."""
        self._signed_get("/api/v3/account", {})

    def my_trades(self, symbol: str, limit: int = 200) -> list[dict]:
        data = self._signed_get("/api/v3/myTrades", {"symbol": symbol, "limit": limit})
        if not isinstance(data, list):
            raise BinanceError(f"unexpected myTrades response: {data!r}")
        return data


def normalize_trade(symbol: str, raw: dict) -> dict:
    """Map a raw Binance fill into our internal Trade shape."""
    qty = float(raw["qty"])
    price = float(raw["price"])
    return {
        "external_id": f"{symbol}-{raw['id']}",
        "symbol": symbol,
        "side": "BUY" if raw.get("isBuyer") else "SELL",
        "price": price,
        "qty": qty,
        "quote_qty": float(raw.get("quoteQty", price * qty)),
        "commission": float(raw.get("commission", 0.0)),
        "trade_time": datetime.fromtimestamp(raw["time"] / 1000, tz=timezone.utc).replace(
            tzinfo=None
        ),
    }
