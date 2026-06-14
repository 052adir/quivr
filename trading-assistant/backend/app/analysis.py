"""Turn a stream of fills into closed round-trips, and compute summary stats.

Round trips are built per symbol with FIFO matching: each SELL consumes the
oldest open BUY lots. Only the closed portion produces a RoundTrip row.
"""

from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime


@dataclass
class ClosedTrip:
    symbol: str
    qty: float
    entry_price: float
    exit_price: float
    entry_time: datetime
    exit_time: datetime
    notional: float
    pnl: float
    pnl_pct: float
    hold_seconds: int

    @property
    def dedup_key(self) -> str:
        # Symbol + both timestamps + rounded qty is stable across re-syncs.
        return (
            f"{self.symbol}|{self.entry_time.isoformat()}|"
            f"{self.exit_time.isoformat()}|{round(self.qty, 6)}"
        )


def build_round_trips(trades: list) -> list[ClosedTrip]:
    """trades: ORM Trade or dict-like objects sorted/here-sorted by trade_time."""
    rows = sorted(trades, key=lambda t: _get(t, "trade_time"))
    open_lots: dict[str, deque] = defaultdict(deque)  # symbol -> [(qty, price, time)]
    trips: list[ClosedTrip] = []

    for tr in rows:
        symbol = _get(tr, "symbol")
        side = _get(tr, "side")
        qty = _get(tr, "qty")
        price = _get(tr, "price")
        when = _get(tr, "trade_time")

        if side == "BUY":
            open_lots[symbol].append([qty, price, when])
            continue

        # SELL: match against oldest open buys.
        remaining = qty
        lots = open_lots[symbol]
        while remaining > 1e-12 and lots:
            lot = lots[0]
            matched = min(remaining, lot[0])
            entry_price = lot[1]
            entry_time = lot[2]
            notional = entry_price * matched
            pnl = (price - entry_price) * matched
            pnl_pct = (price / entry_price - 1.0) if entry_price else 0.0
            hold = max(0, int((when - entry_time).total_seconds()))
            trips.append(
                ClosedTrip(
                    symbol=symbol,
                    qty=matched,
                    entry_price=entry_price,
                    exit_price=price,
                    entry_time=entry_time,
                    exit_time=when,
                    notional=notional,
                    pnl=pnl,
                    pnl_pct=pnl_pct,
                    hold_seconds=hold,
                )
            )
            lot[0] -= matched
            remaining -= matched
            if lot[0] <= 1e-12:
                lots.popleft()
        # Any unmatched SELL (short / pre-existing balance) is ignored for MVP.

    return trips


def summarize(trips: list) -> dict:
    """High-level stats over a list of RoundTrip/ClosedTrip objects."""
    n = len(trips)
    if n == 0:
        return {
            "trades": 0,
            "win_rate": 0.0,
            "total_pnl": 0.0,
            "avg_win": 0.0,
            "avg_loss": 0.0,
            "profit_factor": 0.0,
            "best": None,
            "worst": None,
        }

    wins = [t for t in trips if _get(t, "pnl") > 0]
    losses = [t for t in trips if _get(t, "pnl") <= 0]
    gross_win = sum(_get(t, "pnl") for t in wins)
    gross_loss = -sum(_get(t, "pnl") for t in losses)
    best = max(trips, key=lambda t: _get(t, "pnl"))
    worst = min(trips, key=lambda t: _get(t, "pnl"))

    return {
        "trades": n,
        "win_rate": round(len(wins) / n * 100, 1),
        "total_pnl": round(sum(_get(t, "pnl") for t in trips), 2),
        "avg_win": round(gross_win / len(wins), 2) if wins else 0.0,
        "avg_loss": round(-gross_loss / len(losses), 2) if losses else 0.0,
        "profit_factor": round(gross_win / gross_loss, 2) if gross_loss > 0 else 0.0,
        "best": {"symbol": _get(best, "symbol"), "pnl": round(_get(best, "pnl"), 2)},
        "worst": {"symbol": _get(worst, "symbol"), "pnl": round(_get(worst, "pnl"), 2)},
    }


def _get(obj, attr):
    """Read an attribute from either an ORM object or a dict."""
    if isinstance(obj, dict):
        return obj[attr]
    return getattr(obj, attr)
