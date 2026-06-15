"""Multi-platform connector layer.

A single contract — `fetch(connection) -> FetchResult` — lets Mentor Trade read
a trader's executed trades from any platform, read-only. Adding a new platform
is just another entry in `_REGISTRY`.

Providers:
  - "demo"    : synthetic feed (no network)
  - "binance" : Binance REST (hand-rolled, HMAC)
  - "ccxt"    : any of 100+ crypto exchanges via the ccxt library
  - "mt5"     : MetaTrader 5 (forex/CFD/stocks) via the MetaTrader5 package,
                using the read-only *investor* password

Crypto platforms return raw `fills` (BUY/SELL) which the FIFO engine pairs into
round-trips. MT5 reports closed positions with broker-computed P&L directly, so
its connector returns `round_trips` (handles long *and* short correctly).
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from . import crypto
from .binance_client import BinanceClient, normalize_trade
from .mock_data import generate_demo_trades

log = logging.getLogger("mentor.connectors")

# How far back to pull history on each sync.
LOOKBACK_DAYS = 90


@dataclass
class FetchResult:
    fills: list[dict] = field(default_factory=list)
    round_trips: list[dict] = field(default_factory=list)


class ConnectorError(RuntimeError):
    pass


def _meta(conn) -> dict:
    raw = crypto.decrypt(conn.meta_enc) if conn.meta_enc else ""
    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {}


def _symbols(conn) -> list[str]:
    return [s.strip() for s in (conn.symbols or "").split(",") if s.strip()]


# --------------------------------------------------------------------------- #
# demo
# --------------------------------------------------------------------------- #
def _fetch_demo(conn) -> FetchResult:
    return FetchResult(fills=generate_demo_trades())


# --------------------------------------------------------------------------- #
# binance (hand-rolled REST)
# --------------------------------------------------------------------------- #
def _fetch_binance(conn) -> FetchResult:
    client = BinanceClient(
        crypto.decrypt(conn.api_key_enc), crypto.decrypt(conn.api_secret_enc)
    )
    fills = []
    for symbol in _symbols(conn):
        for raw in client.my_trades(symbol.upper()):
            fills.append(normalize_trade(symbol.upper(), raw))
    return FetchResult(fills=fills)


def _verify_binance(conn) -> None:
    BinanceClient(
        crypto.decrypt(conn.api_key_enc), crypto.decrypt(conn.api_secret_enc)
    ).verify()


# --------------------------------------------------------------------------- #
# ccxt (any crypto exchange)
# --------------------------------------------------------------------------- #
def _ccxt_exchange(conn):
    import ccxt

    meta = _meta(conn)
    exchange_id = (meta.get("exchange") or "binance").lower()
    if not hasattr(ccxt, exchange_id):
        raise ConnectorError(f"בורסה לא נתמכת ב-ccxt: {exchange_id}")
    klass = getattr(ccxt, exchange_id)
    return klass(
        {
            "apiKey": crypto.decrypt(conn.api_key_enc),
            "secret": crypto.decrypt(conn.api_secret_enc),
            "enableRateLimit": True,
        }
    )


def _fetch_ccxt(conn) -> FetchResult:
    exchange = _ccxt_exchange(conn)
    since = int((datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).timestamp() * 1000)
    fills = []
    for symbol in _symbols(conn):
        try:
            trades = exchange.fetch_my_trades(symbol, since=since)
        except Exception as exc:  # noqa: BLE001 — surface per-symbol issues, keep going
            log.warning("ccxt fetch_my_trades failed for %s: %s", symbol, exc)
            continue
        for t in trades:
            price = float(t["price"])
            qty = float(t["amount"])
            ts = t.get("timestamp") or 0
            fills.append(
                {
                    "external_id": f"{exchange.id}-{symbol}-{t['id']}",
                    "symbol": symbol.replace("/", ""),
                    "side": (t["side"] or "").upper(),
                    "price": price,
                    "qty": qty,
                    "quote_qty": float(t.get("cost") or price * qty),
                    "commission": float((t.get("fee") or {}).get("cost") or 0.0),
                    "trade_time": datetime.fromtimestamp(ts / 1000, tz=timezone.utc).replace(tzinfo=None),
                }
            )
    return FetchResult(fills=fills)


def _verify_ccxt(conn) -> None:
    exchange = _ccxt_exchange(conn)
    try:
        exchange.fetch_balance()
    except Exception as exc:  # noqa: BLE001
        raise ConnectorError(f"אימות מפתח הבורסה נכשל: {exc}")


# --------------------------------------------------------------------------- #
# MetaTrader 5 (forex / CFD / stocks)
# --------------------------------------------------------------------------- #
def _mt5_login(conn):
    """Initialize + log in to MT5 with the investor (read-only) password."""
    try:
        import MetaTrader5 as mt5
    except ImportError as exc:
        raise ConnectorError("חבילת MetaTrader5 לא מותקנת (Windows בלבד).") from exc

    meta = _meta(conn)
    login = meta.get("login")
    server = meta.get("server")
    password = crypto.decrypt(conn.api_secret_enc)
    if not mt5.initialize():
        raise ConnectorError("לא ניתן להתחבר ל-MT5 — ודא שהטרמינל פתוח ומותקן.")
    ok = mt5.login(int(login), password=password, server=server) if login else mt5.login(password=password, server=server)
    if not ok:
        err = mt5.last_error()
        mt5.shutdown()
        raise ConnectorError(f"התחברות ל-MT5 נכשלה: {err}")
    return mt5


def _fetch_mt5(conn) -> FetchResult:
    mt5 = _mt5_login(conn)
    try:
        frm = datetime.now() - timedelta(days=LOOKBACK_DAYS)
        deals = mt5.history_deals_get(frm, datetime.now())
        if deals is None:
            return FetchResult()
        round_trips = _mt5_round_trips(mt5, list(deals))
        return FetchResult(round_trips=round_trips)
    finally:
        mt5.shutdown()


def _mt5_round_trips(mt5, deals) -> list[dict]:
    """Pair MT5 deals by position into closed round-trips (long & short)."""
    by_pos: dict = {}
    for d in deals:
        # Only trade deals (skip balance/credit operations).
        if d.type not in (mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL):
            continue
        by_pos.setdefault(d.position_id, []).append(d)

    trips = []
    for pos_id, ds in by_pos.items():
        ins = [d for d in ds if d.entry == mt5.DEAL_ENTRY_IN]
        outs = [d for d in ds if d.entry == mt5.DEAL_ENTRY_OUT]
        if not ins or not outs:
            continue  # still open, or incomplete history
        vol = sum(d.volume for d in ins) or 1.0
        entry_price = sum(d.price * d.volume for d in ins) / vol
        exit_vol = sum(d.volume for d in outs) or 1.0
        exit_price = sum(d.price * d.volume for d in outs) / exit_vol
        entry_time = datetime.fromtimestamp(min(d.time for d in ins))
        exit_time = datetime.fromtimestamp(max(d.time for d in outs))
        # Broker-accurate P&L: profit + swap + commission on the closing deals.
        pnl = sum(d.profit + d.swap + d.commission for d in outs)
        notional = entry_price * vol  # proxy (lots); patterns use it relatively
        symbol = ins[0].symbol
        trips.append(
            {
                "symbol": symbol,
                "qty": vol,
                "entry_price": entry_price,
                "exit_price": exit_price,
                "entry_time": entry_time,
                "exit_time": exit_time,
                "notional": notional,
                "pnl": pnl,
                "pnl_pct": (pnl / notional) if notional else 0.0,
                "hold_seconds": max(0, int((exit_time - entry_time).total_seconds())),
                "dedup_key": f"mt5|{pos_id}",
            }
        )
    return trips


def _verify_mt5(conn) -> None:
    mt5 = _mt5_login(conn)
    mt5.shutdown()


# --------------------------------------------------------------------------- #
# Registry
# --------------------------------------------------------------------------- #
_REGISTRY = {
    "demo": (_fetch_demo, None),
    "binance": (_fetch_binance, _verify_binance),
    "ccxt": (_fetch_ccxt, _verify_ccxt),
    "mt5": (_fetch_mt5, _verify_mt5),
}

SUPPORTED_PROVIDERS = list(_REGISTRY.keys())


def fetch(conn) -> FetchResult:
    provider = (conn.provider or "demo").lower()
    entry = _REGISTRY.get(provider)
    if not entry:
        raise ConnectorError(f"פלטפורמה לא נתמכת: {provider}")
    return entry[0](conn)


def verify(conn) -> None:
    """Validate credentials at connect time. No-op for providers without one."""
    provider = (conn.provider or "demo").lower()
    entry = _REGISTRY.get(provider)
    if not entry:
        raise ConnectorError(f"פלטפורמה לא נתמכת: {provider}")
    if entry[1] is not None:
        entry[1](conn)
