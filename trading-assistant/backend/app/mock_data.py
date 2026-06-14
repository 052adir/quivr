"""Synthetic trade feed for the DEMO connection.

Generates ~30 days of realistic fills that deliberately exhibit the beginner
mistakes the pattern engine looks for (revenge trades, oversized positions,
cutting winners / holding losers) plus some clean winning trades — so a fresh
install has a populated, meaningful dashboard to show.
"""

import random
from datetime import datetime, timedelta, timezone

# Rough reference prices so notional values look believable.
_REF_PRICE = {"BTCUSDT": 65000.0, "ETHUSDT": 3400.0, "SOLUSDT": 150.0}


def _fill(symbol, side, price, qty, when, seq):
    return {
        "external_id": f"DEMO-{symbol}-{seq}",
        "symbol": symbol,
        "side": side,
        "price": round(price, 2),
        "qty": round(qty, 6),
        "quote_qty": round(price * qty, 2),
        "commission": round(price * qty * 0.001, 4),
        "trade_time": when.replace(tzinfo=None),
    }


def generate_demo_trades() -> list[dict]:
    rng = random.Random(42)  # deterministic so the demo is stable
    now = datetime.now(timezone.utc)
    trades: list[dict] = []
    seq = 0

    def add(symbol, side, price, qty, when):
        nonlocal seq
        seq += 1
        trades.append(_fill(symbol, side, price, qty, when, seq))

    # A scripted sequence of round trips spread across the last ~25 days.
    # Each tuple: (symbol, base_qty, pnl_pct, hold_hours, oversized, revenge_gap_min)
    scenarios = [
        ("BTCUSDT", 0.02, 0.035, 20, False, None),   # clean win, held to target
        ("ETHUSDT", 0.4, -0.11, 2, False, None),     # big loss, no stop-loss
        ("ETHUSDT", 0.9, -0.06, 1, True, 8),          # revenge + oversized right after
        ("SOLUSDT", 6.0, 0.018, 0.4, False, None),   # tiny win, cut early
        ("BTCUSDT", 0.015, 0.05, 30, False, None),   # clean win
        ("SOLUSDT", 8.0, -0.09, 6, False, None),     # held a loser too long
        ("ETHUSDT", 0.3, 0.022, 5, False, None),
        ("BTCUSDT", 0.05, -0.07, 1, True, 12),        # revenge + oversized
        ("SOLUSDT", 5.0, 0.03, 10, False, None),
        ("ETHUSDT", 0.35, -0.04, 3, False, None),
        ("BTCUSDT", 0.018, 0.028, 22, False, None),
        ("SOLUSDT", 7.0, -0.08, 8, False, None),     # holding loser
    ]

    t = now - timedelta(days=25)
    for symbol, base_qty, pnl_pct, hold_hours, oversized, revenge_gap in scenarios:
        # Space entries a couple of days apart, with intraday jitter.
        t = t + timedelta(days=rng.uniform(1.5, 2.5), hours=rng.uniform(0, 6))
        ref = _REF_PRICE[symbol]
        entry_price = ref * rng.uniform(0.9, 1.1)
        qty = base_qty * (3.2 if oversized else 1.0)

        entry_time = t
        exit_time = entry_time + timedelta(hours=hold_hours)
        exit_price = entry_price * (1 + pnl_pct)

        add(symbol, "BUY", entry_price, qty, entry_time)
        add(symbol, "SELL", exit_price, qty, exit_time)

        # Revenge trade: a fresh oversized entry shortly after a losing close.
        if revenge_gap is not None:
            rt = exit_time + timedelta(minutes=revenge_gap)
            rprice = ref * rng.uniform(0.9, 1.1)
            rqty = base_qty * 2.5
            add(symbol, "BUY", rprice, rqty, rt)
            add(symbol, "SELL", rprice * 0.99, rqty, rt + timedelta(hours=1))
            t = rt

    # A short overtrading burst within a single day (many quick scalps).
    burst_day = now - timedelta(days=3)
    for i in range(9):
        bt = burst_day + timedelta(minutes=20 * i)
        price = _REF_PRICE["SOLUSDT"] * rng.uniform(0.97, 1.03)
        qty = 3.0
        add("SOLUSDT", "BUY", price, qty, bt)
        add("SOLUSDT", "SELL", price * rng.uniform(0.99, 1.01), qty, bt + timedelta(minutes=8))

    trades.sort(key=lambda x: x["trade_time"])
    return trades
