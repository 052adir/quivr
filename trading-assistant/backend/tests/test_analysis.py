"""Round-trip (FIFO) construction and summary stats."""

from datetime import datetime, timedelta

from app.analysis import build_round_trips, summarize

T0 = datetime(2026, 1, 1, 10, 0, 0)


def _fill(symbol, side, price, qty, minutes):
    return {
        "symbol": symbol,
        "side": side,
        "price": price,
        "qty": qty,
        "trade_time": T0 + timedelta(minutes=minutes),
    }


def test_single_round_trip_pnl():
    fills = [
        _fill("BTCUSDT", "BUY", 100.0, 1.0, 0),
        _fill("BTCUSDT", "SELL", 110.0, 1.0, 60),
    ]
    trips = build_round_trips(fills)
    assert len(trips) == 1
    t = trips[0]
    assert t.qty == 1.0
    assert t.pnl == 10.0
    assert round(t.pnl_pct, 4) == 0.1
    assert t.hold_seconds == 3600


def test_fifo_matching_partial_lots():
    # Two buys, one larger sell -> sell consumes oldest lot first.
    fills = [
        _fill("ETHUSDT", "BUY", 100.0, 1.0, 0),
        _fill("ETHUSDT", "BUY", 120.0, 1.0, 10),
        _fill("ETHUSDT", "SELL", 130.0, 1.5, 20),
    ]
    trips = build_round_trips(fills)
    # 1.0 @100 fully closed, 0.5 of the @120 lot closed -> 2 round trips.
    assert len(trips) == 2
    assert round(trips[0].pnl, 2) == 30.0  # (130-100)*1.0
    assert round(trips[1].pnl, 2) == 5.0  # (130-120)*0.5


def test_summarize_win_rate():
    fills = [
        _fill("BTCUSDT", "BUY", 100.0, 1.0, 0),
        _fill("BTCUSDT", "SELL", 110.0, 1.0, 10),  # win
        _fill("BTCUSDT", "BUY", 100.0, 1.0, 20),
        _fill("BTCUSDT", "SELL", 90.0, 1.0, 30),  # loss
    ]
    s = summarize(build_round_trips(fills))
    assert s["trades"] == 2
    assert s["win_rate"] == 50.0
    assert s["total_pnl"] == 0.0


def test_summarize_empty():
    s = summarize([])
    assert s["trades"] == 0 and s["win_rate"] == 0.0
