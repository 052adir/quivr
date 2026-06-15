"""Pattern engine: the coaching rules fire on the right shapes."""

from datetime import datetime, timedelta
from types import SimpleNamespace

from app import patterns

T0 = datetime(2026, 1, 1, 10, 0, 0)


def trip(symbol="BTCUSDT", pnl_pct=0.0, notional=1000.0, hold_h=2, entry_min=0, key=None):
    entry = T0 + timedelta(minutes=entry_min)
    exit_ = entry + timedelta(hours=hold_h)
    return SimpleNamespace(
        symbol=symbol,
        pnl=notional * pnl_pct,
        pnl_pct=pnl_pct,
        notional=notional,
        entry_time=entry,
        exit_time=exit_,
        hold_seconds=int(hold_h * 3600),
        dedup_key=key or f"{symbol}-{entry_min}",
    )


def types_of(alerts):
    return {a["type"] for a in alerts}


def test_no_stop_loss_on_large_loss():
    alerts = patterns.detect([trip(pnl_pct=-0.12)], account_size=10000)
    assert "no_stop_loss" in types_of(alerts)


def test_good_win():
    alerts = patterns.detect([trip(pnl_pct=0.04)], account_size=10000)
    assert "good_win" in types_of(alerts)


def test_oversized_relative_to_median():
    trips = [
        trip(notional=1000, entry_min=0),
        trip(notional=1000, entry_min=100),
        trip(notional=5000, entry_min=200),  # 5x median -> oversized
    ]
    assert "oversized" in types_of(patterns.detect(trips, account_size=100000))


def test_revenge_trade_after_loss():
    loser = trip(symbol="ETHUSDT", pnl_pct=-0.05, entry_min=0, hold_h=1, key="a")
    # New entry 10 minutes after the losing close.
    revenge = trip(symbol="ETHUSDT", pnl_pct=-0.01, entry_min=70, hold_h=1, key="b")
    alerts = patterns.detect([loser, revenge], account_size=100000)
    assert "revenge_trade" in types_of(alerts)


def test_no_alerts_on_empty():
    assert patterns.detect([], account_size=1000) == []


def test_dedup_keys_unique_enough():
    alerts = patterns.detect([trip(pnl_pct=-0.12)], account_size=10000)
    keys = [a["dedup_key"] for a in alerts]
    assert len(keys) == len(set(keys))
