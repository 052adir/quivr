"""The pipeline that keeps a user's journal, round-trips and alerts up to date.

  exchange fills -> Trade rows -> RoundTrip rows -> Alerts -> Telegram push

This is what makes the product "set it and forget it": the user only connects a
read-only key once; everything below runs in the background on a timer.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import connectors, patterns, telegram
from .analysis import build_round_trips
from .models import Alert, RoundTrip, Trade, User


def _store_trades(db: Session, user_id: int, fills: list[dict]) -> int:
    """Insert any fills we haven't seen before. Returns new-row count."""
    if not fills:
        return 0
    existing = set(
        db.scalars(select(Trade.external_id).where(Trade.user_id == user_id)).all()
    )
    new_count = 0
    for f in fills:
        if f["external_id"] in existing:
            continue
        db.add(Trade(user_id=user_id, **f))
        existing.add(f["external_id"])
        new_count += 1
    db.flush()
    return new_count


def _store_round_trips_direct(db: Session, user_id: int, trips: list[dict]) -> int:
    """Insert connector-provided closed round-trips (e.g. MT5). Dedup by key."""
    if not trips:
        return 0
    existing = set(
        db.scalars(select(RoundTrip.dedup_key).where(RoundTrip.user_id == user_id)).all()
    )
    new_count = 0
    for t in trips:
        if t["dedup_key"] in existing:
            continue
        db.add(RoundTrip(user_id=user_id, **t))
        existing.add(t["dedup_key"])
        new_count += 1
    db.flush()
    return new_count


def _rebuild_round_trips(db: Session, user_id: int) -> int:
    """Recompute closed trips from full history; insert ones we don't have."""
    trades = db.scalars(select(Trade).where(Trade.user_id == user_id)).all()
    trips = build_round_trips(trades)
    existing = set(
        db.scalars(select(RoundTrip.dedup_key).where(RoundTrip.user_id == user_id)).all()
    )
    new_count = 0
    for t in trips:
        if t.dedup_key in existing:
            continue
        db.add(
            RoundTrip(
                user_id=user_id,
                symbol=t.symbol,
                qty=t.qty,
                entry_price=t.entry_price,
                exit_price=t.exit_price,
                entry_time=t.entry_time,
                exit_time=t.exit_time,
                notional=t.notional,
                pnl=t.pnl,
                pnl_pct=t.pnl_pct,
                hold_seconds=t.hold_seconds,
                dedup_key=t.dedup_key,
            )
        )
        existing.add(t.dedup_key)
        new_count += 1
    db.flush()
    return new_count


def _refresh_alerts(db: Session, user: User) -> list[Alert]:
    """Run the pattern engine; persist & return newly-created alerts."""
    trips = db.scalars(
        select(RoundTrip).where(RoundTrip.user_id == user.id)
    ).all()
    found = patterns.detect(trips, user.account_size)
    existing = set(
        db.scalars(select(Alert.dedup_key).where(Alert.user_id == user.id)).all()
    )
    created: list[Alert] = []
    for a in found:
        if a["dedup_key"] in existing:
            continue
        alert = Alert(user_id=user.id, **a)
        db.add(alert)
        existing.add(a["dedup_key"])
        created.append(alert)
    db.flush()
    return created


def sync_user(db: Session, user: User) -> dict:
    new_trades = 0
    for conn in user.connections:
        try:
            result = connectors.fetch(conn)
        except Exception as exc:  # one bad connection shouldn't kill the sync
            print(f"[sync] connection {conn.id} ({conn.provider}) failed: {exc}")
            continue
        new_trades += _store_trades(db, user.id, result.fills)
        _store_round_trips_direct(db, user.id, result.round_trips)
        conn.last_synced_at = datetime.now(timezone.utc).replace(tzinfo=None)

    _rebuild_round_trips(db, user.id)
    new_alerts = _refresh_alerts(db, user)
    db.commit()

    # Push the new alerts out so the user hears about them in real time.
    if user.telegram_chat_id:
        for alert in new_alerts:
            icon = {"warning": "⚠️", "success": "✅", "info": "💡"}.get(alert.severity, "•")
            ok = telegram.send_message(
                user.telegram_chat_id, f"{icon} <b>{alert.title}</b>\n{alert.message}"
            )
            if ok:
                alert.delivered = True
        db.commit()

    return {"new_trades": new_trades, "new_alerts": len(new_alerts)}


def sync_all_users(db: Session) -> None:
    for user in db.scalars(select(User)).all():
        try:
            sync_user(db, user)
        except Exception as exc:
            print(f"[sync] user {user.id} failed: {exc}")
            db.rollback()
