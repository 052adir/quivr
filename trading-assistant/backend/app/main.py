"""Mentor Trade — FastAPI application.

Serves the JSON API and the static dashboard/landing, runs a background sync
loop, and enforces the subscription paywall. Production concerns (logging,
security headers, CORS, health checks, rate limiting, encrypted credentials,
Stripe billing) are wired in here.
"""

import io
import json
import logging
import secrets
import threading
import time
import uuid
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from . import (
    __version__,
    access,
    billing,
    connectors,
    crypto,
    diagnosis,
    education,
    ratelimit,
    security,
    sync_service,
    telegram,
    telegram_bot,
)
from .analysis import summarize
from .config import settings
from .database import SessionLocal, get_db, init_db
from .models import Alert, ChatMessage, Connection, Lead, RoundTrip, User
from .schemas import (
    ChatIn,
    ConnectionIn,
    EAEventIn,
    LeadIn,
    LoginIn,
    RegisterIn,
    SettingsIn,
    TokenOut,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("mentor")

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
LANDING_DIR = ROOT_DIR / "landing"
WATCHER_EXE = ROOT_DIR / "watcher" / "dist" / "MentorGuard.exe"

def _sync_loop():
    while True:
        time.sleep(settings.sync_interval_seconds)
        db = SessionLocal()
        try:
            sync_service.sync_all_users(db)
        except Exception:
            log.exception("[sync-loop] error")
        finally:
            db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    threading.Thread(target=_sync_loop, daemon=True).start()
    if settings.telegram_bot_token:
        threading.Thread(target=telegram_bot.poll_loop, daemon=True).start()
    log.info(
        "Mentor Trade %s ready | AI:%s | billing:%s | env:%s",
        __version__,
        "on" if settings.ai_enabled else "off",
        "on" if settings.billing_enabled else "trial-only",
        settings.environment,
    )
    yield


app = FastAPI(title="Mentor Trade", version=__version__, lifespan=lifespan)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# --------------------------------------------------------------------------- #
# Middleware: request logging + security headers
# --------------------------------------------------------------------------- #
@app.middleware("http")
async def observability(request: Request, call_next):
    rid = uuid.uuid4().hex[:8]
    start = time.monotonic()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("[%s] unhandled error on %s %s", rid, request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "internal error"})
    elapsed = (time.monotonic() - start) * 1000
    log.info("[%s] %s %s -> %s (%.0fms)", rid, request.method, request.url.path,
             response.status_code, elapsed)
    response.headers["X-Request-ID"] = rid
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# --------------------------------------------------------------------------- #
# Auth + access dependencies
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


def require_access(user: User = Depends(current_user)) -> User:
    """Gate premium features behind an active trial or subscription."""
    st = access.state(user)
    if not st["active"]:
        raise HTTPException(
            402, detail={"error": "subscription_required", "status": st["status"]}
        )
    return user


# --------------------------------------------------------------------------- #
# Ops
# --------------------------------------------------------------------------- #
@app.get("/healthz")
def healthz(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "version": __version__}


@app.get("/version")
def version():
    return {
        "version": __version__,
        "ai_enabled": settings.ai_enabled,
        "billing_enabled": settings.billing_enabled,
        "environment": settings.environment,
    }


# --------------------------------------------------------------------------- #
# Auth + settings
# --------------------------------------------------------------------------- #
@app.post("/api/auth/register", response_model=TokenOut)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    ratelimit.limit(request, key="register", max_calls=5, window_secs=300)
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(400, "email already registered")
    user = User(
        email=body.email,
        password_hash=security.hash_password(body.password),
        token=security.new_token(),
    )
    access.start_trial(user)
    db.add(user)
    db.commit()
    log.info("new user registered: %s", user.email)
    return TokenOut(token=user.token, email=user.email)


@app.post("/api/auth/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    ratelimit.limit(request, key="login", max_calls=10, window_secs=300)
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
        "telegram_linked": user.telegram_chat_id is not None,
        "ai_enabled": settings.ai_enabled,
        "access": access.state(user),
    }


@app.get("/api/download/watcher")
def download_watcher(user: User = Depends(current_user)):
    """Serve the desktop watcher as a single .exe — no zip, no extraction.

    The user just downloads MentorGuard.exe and double-clicks it; a live window
    opens and watches their MT5 trades. Works fully locally (Windows alerts),
    no configuration required.
    """
    if not WATCHER_EXE.exists():
        raise HTTPException(503, "שומר המסחר עדיין לא נבנה בשרת הזה")
    return FileResponse(
        WATCHER_EXE,
        filename="MentorGuard.exe",
        media_type="application/octet-stream",
    )


@app.post("/api/telegram/connect")
def telegram_connect(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Issue a one-time link code (+ deep link) to connect the user's Telegram."""
    if not user.telegram_link_code:
        user.telegram_link_code = secrets.token_hex(4)
        db.commit()
    bot = settings.telegram_bot_username
    return {
        "code": user.telegram_link_code,
        "deep_link": f"https://t.me/{bot}?start=link-{user.telegram_link_code}" if bot else None,
        "bot_configured": bool(settings.telegram_bot_token),
        "linked": user.telegram_chat_id is not None,
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
# Billing
# --------------------------------------------------------------------------- #
@app.get("/api/billing/status")
def billing_status(user: User = Depends(current_user)):
    return {
        "access": access.state(user),
        "billing_enabled": settings.billing_enabled,
        "price_label": "₪79 / חודש",
    }


@app.post("/api/billing/checkout")
def billing_checkout(user: User = Depends(current_user)):
    if not settings.billing_enabled:
        raise HTTPException(503, "billing not configured")
    try:
        url = billing.create_checkout_session(user)
    except Exception as exc:
        log.exception("checkout failed")
        raise HTTPException(502, f"checkout failed: {exc}")
    return {"url": url}


@app.post("/api/billing/webhook")
async def billing_webhook(request: Request, db: Session = Depends(get_db)):
    if not settings.billing_enabled:
        raise HTTPException(503, "billing not configured")
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = billing.verify_and_parse_webhook(payload, sig)
    except Exception as exc:
        raise HTTPException(400, f"invalid webhook: {exc}")
    billing.apply_webhook_event(db, event)
    return {"received": True}


# --------------------------------------------------------------------------- #
# Connections
# --------------------------------------------------------------------------- #
@app.get("/api/connections")
def list_connections(user: User = Depends(current_user), db: Session = Depends(get_db)):
    conns = db.scalars(select(Connection).where(Connection.user_id == user.id)).all()
    return [
        {
            "id": c.id,
            "provider": c.provider,
            "label": c.label,
            "symbols": c.symbols,
            "is_demo": c.is_demo,
            "last_synced_at": c.last_synced_at.isoformat() if c.last_synced_at else None,
        }
        for c in conns
    ]


# Default labels + symbol hints per platform.
_PROVIDER_DEFAULTS = {
    "demo": "חשבון דמו",
    "binance": "Binance",
    "ccxt": "בורסת קריפטו",
    "mt5": "MetaTrader 5",
}


@app.post("/api/connections")
def add_connection(
    body: ConnectionIn, user: User = Depends(require_access), db: Session = Depends(get_db)
):
    provider = (body.provider or "binance").strip().lower()
    if body.api_key.strip().upper() == "DEMO":
        provider = "demo"
    if provider not in connectors.SUPPORTED_PROVIDERS:
        raise HTTPException(400, f"פלטפורמה לא נתמכת: {provider}")

    # Map the request onto the generic Connection shape (creds + encrypted meta).
    meta: dict = {}
    api_key, api_secret = "", ""
    if provider == "binance":
        api_key, api_secret = body.api_key.strip(), body.api_secret.strip()
    elif provider == "ccxt":
        api_key, api_secret = body.api_key.strip(), body.api_secret.strip()
        meta = {"exchange": (body.exchange or "binance").strip().lower()}
    elif provider == "mt5":
        api_secret = body.password.strip()  # investor (read-only) password
        meta = {"login": body.login.strip(), "server": body.server.strip()}

    label = body.label or _PROVIDER_DEFAULTS.get(provider, provider)
    conn = Connection(
        user_id=user.id,
        provider=provider,
        exchange=meta.get("exchange", "binance"),
        label=label,
        is_demo=(provider == "demo"),
        api_key_enc=crypto.encrypt(api_key),
        api_secret_enc=crypto.encrypt(api_secret),
        meta_enc=crypto.encrypt(json.dumps(meta)) if meta else "",
        symbols=body.symbols,
    )

    # Validate credentials before saving (instant feedback). Demo has no check.
    try:
        connectors.verify(conn)
    except connectors.ConnectorError as exc:
        raise HTTPException(400, str(exc))

    db.add(conn)
    db.commit()
    db.refresh(user)
    result = sync_service.sync_user(db, user)
    return {"id": conn.id, "provider": provider, "is_demo": conn.is_demo, **result}


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
def sync_now(user: User = Depends(require_access), db: Session = Depends(get_db)):
    return sync_service.sync_user(db, user)


# --------------------------------------------------------------------------- #
# Dashboard / journal / alerts / review (paywalled)
# --------------------------------------------------------------------------- #
@app.get("/api/dashboard")
def dashboard(user: User = Depends(require_access), db: Session = Depends(get_db)):
    trips = db.scalars(
        select(RoundTrip).where(RoundTrip.user_id == user.id).order_by(RoundTrip.exit_time)
    ).all()
    stats = summarize(trips)

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


@app.get("/api/diagnosis")
def get_diagnosis(user: User = Depends(require_access), db: Session = Depends(get_db)):
    trips = db.scalars(
        select(RoundTrip).where(RoundTrip.user_id == user.id)
    ).all()
    return diagnosis.build_diagnosis(trips, user.account_size)


@app.get("/api/trades")
def trades(user: User = Depends(require_access), db: Session = Depends(get_db)):
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
def alerts(user: User = Depends(require_access), db: Session = Depends(get_db)):
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
def weekly_review(user: User = Depends(require_access), db: Session = Depends(get_db)):
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
    body: ChatIn, user: User = Depends(require_access), db: Session = Depends(get_db)
):
    reply = education.answer(db, user, body.message.strip())
    return {"reply": reply}


# --------------------------------------------------------------------------- #
# Marketing — public lead capture + affiliate tracking
# --------------------------------------------------------------------------- #
@app.post("/api/leads")
def capture_lead(body: LeadIn, request: Request, db: Session = Depends(get_db)):
    ratelimit.limit(request, key="leads", max_calls=20, window_secs=300)
    if not body.email and not body.phone:
        raise HTTPException(400, "email or phone required")
    lead = Lead(
        email=(body.email or "").strip()[:255] or None,
        phone=(body.phone or "").strip()[:40] or None,
        source=(body.source or "landing").strip()[:40],
        ref_code=(body.ref_code or "").strip()[:40] or None,
    )
    db.add(lead)
    db.commit()
    return {"ok": True}


@app.post("/api/ea/event")
def ea_event(body: EAEventIn, request: Request, db: Session = Depends(get_db)):
    """Receive a live alert from the MT5 MentorGuard EA and fan it out.

    Authenticated by the user's account token (the EA can't send a bearer
    header). Stores it in the alert feed and pushes it to Telegram.
    """
    ratelimit.limit(request, key="ea", max_calls=120, window_secs=60)
    user = db.scalar(select(User).where(User.token == body.token.strip()))
    if not user:
        raise HTTPException(401, "invalid token")

    ref = (body.ref or body.message)[:60]
    dedup = f"ea|{body.type}|{body.symbol or ''}|{ref}"
    existing = db.scalar(
        select(Alert).where(Alert.user_id == user.id, Alert.dedup_key == dedup)
    )
    if existing:
        return {"ok": True, "duplicate": True}

    alert = Alert(
        user_id=user.id,
        type=body.type[:40],
        severity=(body.severity or "warning")[:12],
        title="התראה חיה מ-MT5",
        message=body.message,
        symbol=(body.symbol or None),
        dedup_key=dedup,
    )
    db.add(alert)
    db.commit()

    if user.telegram_chat_id:
        icon = {"warning": "⚠️", "success": "✅", "info": "💡"}.get(alert.severity, "•")
        if telegram.send_message(user.telegram_chat_id, f"{icon} {alert.message}"):
            alert.delivered = True
            db.commit()
    return {"ok": True}


@app.get("/api/leads")
def list_leads(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Lead).order_by(Lead.created_at.desc())).all()
    return [
        {
            "email": r.email,
            "phone": r.phone,
            "source": r.source,
            "ref_code": r.ref_code,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


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
# Static frontend + public marketing landing
# --------------------------------------------------------------------------- #
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/app")
    def app_index():
        return FileResponse(FRONTEND_DIR / "index.html")


if LANDING_DIR.exists():
    @app.get("/")
    def landing():
        return FileResponse(LANDING_DIR / "index.html")
elif FRONTEND_DIR.exists():
    @app.get("/")
    def root_to_app():
        return FileResponse(FRONTEND_DIR / "index.html")


