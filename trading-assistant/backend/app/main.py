"""Mentor Trade — FastAPI application.

Serves the JSON API and the static dashboard, and runs a background loop that
keeps every user's journal and alerts fresh.
"""

import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import education, security, sync_service
from .analysis import summarize
from .binance_client import BinanceClient, BinanceError
from .config import settings
from .database import SessionLocal, get_db, init_db
from .models import Alert, ChatMessage, Connection, RoundTrip, User
from .schemas import ChatIn, ConnectionIn, LoginIn, RegisterIn, SettingsIn, TokenOut

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"

app = FastAPI(title="Mentor Trade", version="0.1.0")


# --------------------------------------------------------------------------- #
# Auth dependency
# --------------------------------------------------------------------------- #
def current_user(
    authorization: str = Header(default=""), db: Session = Depends(get_db)
) -> User:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "missing token")
    user = db.scalar(select(User).where(User.token == token))
    if not user:
        raise HTTPException(401, "invalid token")
    return user


# --------------------------------------------------------------------------- #
# Auth + settings
# --------------------------------------------------------------------------- #
@app.post("/api/auth/register", response_model=TokenOut)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(400, "email already registered")
    user = User(
        email=body.email,
        password_hash=security.hash_password(body.password),
        token=security.new_token(),
    )
    db.add(user)
    db.commit()
    return TokenOut(token=user.token, email=user.email)


@app.post("/api/auth/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email))
    if not user or not security.verify_password(body.password, user.password_hash):
        raise HTTPException(401, "bad credentials")
    return TokenOut(token=user.token, email=user.email)


@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return {
        "email": user.email,
        "account_size": user.account_size,
        "telegram_chat_id": user.telegram_chat_id,
        "ai_enabled": settings.ai_enabled,
    }


@app.put("/api/settings")
def update_settings(
    body: SettingsIn, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    if body.account_size is not None:
        user.account_size = body.account_size
    if body.telegram_chat_id is not None:
        user.telegram_chat_id = body.telegram_chat_id or None
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Connections
# --------------------------------------------------------------------------- #
@app.get("/api/connections")
def list_connections(user: User = Depends(current_user), db: Session = Depends(get_db)):
    conns = db.scalars(select(Connection).where(Connection.user_id == user.id)).all()
    return [
        {
            "id": c.id,
            "exchange": c.exchange,
            "label": c.label,
            "symbols": c.symbols,
            "is_demo": c.api_key.strip().upper() == "DEMO",
            "last_synced_at": c.last_synced_at.isoformat() if c.last_synced_at else None,
        }
        for c in conns
    ]


@app.post("/api/connections")
def add_connection(
    body: ConnectionIn, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    is_demo = body.api_key.strip().upper() == "DEMO"
    # Verify a real (read-only) key before saving so the user gets instant feedback.
    if not is_demo:
        try:
            BinanceClient(body.api_key, body.api_secret).verify()
        except BinanceError as exc:
            raise HTTPException(400, f"could not verify Binance key: {exc}")

    conn = Connection(
        user_id=user.id,
        exchange=body.exchange,
        label="חשבון דמו" if is_demo else body.label,
        api_key=body.api_key.strip(),
        api_secret=body.api_secret.strip(),
        symbols=body.symbols,
    )
    db.add(conn)
    db.commit()
    db.refresh(user)
    result = sync_service.sync_user(db, user)
    return {"id": conn.id, "is_demo": is_demo, **result}


@app.delete("/api/connections/{conn_id}")
def delete_connection(
    conn_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    conn = db.scalar(
        select(Connection).where(
            Connection.id == conn_id, Connection.user_id == user.id
        )
    )
    if not conn:
        raise HTTPException(404, "connection not found")
    db.delete(conn)
    db.commit()
    return {"ok": True}


@app.post("/api/sync")
def sync_now(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return sync_service.sync_user(db, user)


# --------------------------------------------------------------------------- #
# Dashboard / journal / alerts / review
# --------------------------------------------------------------------------- #
@app.get("/api/dashboard")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    trips = db.scalars(
        select(RoundTrip).where(RoundTrip.user_id == user.id).order_by(RoundTrip.exit_time)
    ).all()
    stats = summarize(trips)

    # Cumulative P&L curve for the chart.
    cum = 0.0
    equity = []
    for t in trips:
        cum += t.pnl
        equity.append({"time": t.exit_time.isoformat(), "cum_pnl": round(cum, 2)})

    alerts = db.scalars(
        select(Alert)
        .where(Alert.user_id == user.id)
        .order_by(Alert.created_at.desc())
        .limit(8)
    ).all()
    unread = db.scalar(
        select(Alert).where(Alert.user_id == user.id, Alert.read == False)  # noqa: E712
    )

    return {
        "stats": stats,
        "equity": equity,
        "recent_alerts": [_alert_dict(a) for a in alerts],
        "has_unread": unread is not None,
    }


@app.get("/api/trades")
def trades(user: User = Depends(current_user), db: Session = Depends(get_db)):
    trips = db.scalars(
        select(RoundTrip)
        .where(RoundTrip.user_id == user.id)
        .order_by(RoundTrip.exit_time.desc())
    ).all()
    return [
        {
            "symbol": t.symbol,
            "qty": round(t.qty, 6),
            "entry_price": round(t.entry_price, 2),
            "exit_price": round(t.exit_price, 2),
            "entry_time": t.entry_time.isoformat(),
            "exit_time": t.exit_time.isoformat(),
            "notional": round(t.notional, 2),
            "pnl": round(t.pnl, 2),
            "pnl_pct": round(t.pnl_pct * 100, 2),
            "hold_hours": round(t.hold_seconds / 3600, 1),
        }
        for t in trips
    ]


@app.get("/api/alerts")
def alerts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Alert).where(Alert.user_id == user.id).order_by(Alert.created_at.desc())
    ).all()
    return [_alert_dict(a) for a in rows]


@app.post("/api/alerts/read")
def mark_read(user: User = Depends(current_user), db: Session = Depends(get_db)):
    for a in db.scalars(
        select(Alert).where(Alert.user_id == user.id, Alert.read == False)  # noqa: E712
    ).all():
        a.read = True
    db.commit()
    return {"ok": True}


@app.get("/api/review/weekly")
def weekly_review(user: User = Depends(current_user), db: Session = Depends(get_db)):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).replace(tzinfo=None)
    trips = db.scalars(
        select(RoundTrip).where(
            RoundTrip.user_id == user.id, RoundTrip.exit_time >= cutoff
        )
    ).all()
    stats = summarize(trips)

    recent_alerts = db.scalars(
        select(Alert).where(
            Alert.user_id == user.id,
            Alert.severity == "warning",
            Alert.created_at >= cutoff,
        )
    ).all()
    # Most frequent weakness this week.
    counts: dict[str, int] = {}
    for a in recent_alerts:
        counts[a.type] = counts.get(a.type, 0) + 1
    weakness = max(counts, key=counts.get) if counts else None

    return {
        "stats": stats,
        "weakness": _WEAKNESS_LABELS.get(weakness),
        "summary": _weekly_summary(stats, weakness),
    }


@app.get("/api/lessons")
def lessons():
    return education.LESSONS


@app.get("/api/chat/history")
def chat_history(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == user.id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    return [{"role": m.role, "content": m.content} for m in rows]


@app.post("/api/chat")
def chat(
    body: ChatIn, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    reply = education.answer(db, user, body.message.strip())
    return {"reply": reply}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
_WEAKNESS_LABELS = {
    "no_stop_loss": "מסחר בלי stop-loss",
    "revenge_trade": "מסחר נקמה",
    "oversized": "פוזיציות גדולות מדי",
    "overtrading": "מסחר יתר",
    "hold_losers": "החזקת מפסידות",
}


def _alert_dict(a: Alert) -> dict:
    return {
        "id": a.id,
        "type": a.type,
        "severity": a.severity,
        "title": a.title,
        "message": a.message,
        "symbol": a.symbol,
        "read": a.read,
        "created_at": a.created_at.isoformat(),
    }


def _weekly_summary(stats: dict, weakness: str | None) -> str:
    if stats["trades"] == 0:
        return "השבוע לא נסגרו עסקאות. חבר חשבון או המשך לסחור — ואני אתחיל לנתח."
    parts = [
        f"השבוע סגרת {stats['trades']} עסקאות עם אחוז הצלחה של {stats['win_rate']}%, "
        f"ורווח/הפסד מצטבר של ${stats['total_pnl']}."
    ]
    if weakness and weakness in _WEAKNESS_LABELS:
        parts.append(f"החולשה הבולטת השבוע: {_WEAKNESS_LABELS[weakness]}.")
    if stats["profit_factor"] >= 1.5:
        parts.append("ה-profit factor שלך חזק — שמור על המשמעת.")
    elif stats["profit_factor"] > 0:
        parts.append("היעד לשבוע הבא: לשפר את היחס בין הרווח הממוצע להפסד הממוצע.")
    return " ".join(parts)


# --------------------------------------------------------------------------- #
# Static frontend
# --------------------------------------------------------------------------- #
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/")
    def index():
        return FileResponse(FRONTEND_DIR / "index.html")


# --------------------------------------------------------------------------- #
# Background sync loop
# --------------------------------------------------------------------------- #
def _sync_loop():
    while True:
        time.sleep(settings.sync_interval_seconds)
        db = SessionLocal()
        try:
            sync_service.sync_all_users(db)
        except Exception as exc:  # never let the loop die
            print(f"[sync-loop] error: {exc}")
        finally:
            db.close()


@app.on_event("startup")
def on_startup():
    init_db()
    thread = threading.Thread(target=_sync_loop, daemon=True)
    thread.start()
    print(
        f"[startup] Mentor Trade ready. AI tutor: "
        f"{'on (' + settings.chat_model + ')' if settings.ai_enabled else 'off (fallback)'}"
    )
