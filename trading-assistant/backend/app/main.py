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
from sqlalchemy import func, select, text
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
from .models import Alert, ChatMessage, Connection, Lead, OpenPosition, RoundTrip, User
from .schemas import (
    ChatIn,
    ConnectionIn,
    EAEventIn,
    LeadIn,
    LoginIn,
    MT5SyncIn,
    RegisterIn,
    SettingsIn,
    TokenOut,
    WebhookEventIn,
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
EA_FILE = ROOT_DIR / "mt5-ea" / "MentorGuard.ex5"  # the free in-terminal bot

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
def download_watcher(
    token: str = "", authorization: str = Header(default=""), db: Session = Depends(get_db)
):
    """Serve the desktop watcher as a single .exe — no zip, no extraction.

    Accepts the token via query param so a plain browser link works (the server
    sets the filename to MentorGuard.exe, immune to stale cached front-end JS).
    """
    tok = (token or authorization.removeprefix("Bearer ")).strip()
    if not db.scalar(select(User).where(User.token == tok)):
        raise HTTPException(401, "invalid token")
    if not WATCHER_EXE.exists():
        raise HTTPException(503, "שומר המסחר עדיין לא נבנה בשרת הזה")
    return FileResponse(
        WATCHER_EXE,
        filename="MentorGuard.exe",
        media_type="application/octet-stream",
    )


@app.get("/api/download/ea")
def download_ea(
    token: str = "", authorization: str = Header(default=""), db: Session = Depends(get_db)
):
    """Serve the free in-terminal bot (MentorGuard.ex5) for MT5 desktop.

    A .ex5 is an MT5 file (not a Windows .exe), so it doesn't trigger
    SmartScreen. The trader drops it into MT5's Experts folder and attaches it.
    """
    tok = (token or authorization.removeprefix("Bearer ")).strip()
    if not db.scalar(select(User).where(User.token == tok)):
        raise HTTPException(401, "invalid token")
    if not EA_FILE.exists():
        raise HTTPException(503, "הבוט עדיין לא נבנה בשרת הזה")
    return FileResponse(
        EA_FILE,
        filename="MentorGuard.ex5",
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
    if provider == "mt5":
        # MT5 must never be driven from the server (login() hijacks the terminal).
        raise HTTPException(
            400, "ל-MT5 השתמש בבוט שמותקן בטרמינל (MentorGuard EA) — לא דרך חיבור כאן."
        )
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


@app.post("/api/mt5/trades")
def mt5_trades(body: MT5SyncIn, request: Request, db: Session = Depends(get_db)):
    """Ingest closed round-trips pushed by the MT5 EA (read from the terminal).

    This is how MT5 history reaches the dashboard/diagnosis WITHOUT the server
    ever logging into MT5 (which would hijack the terminal). The EA reads and
    sends; the server only stores.
    """
    ratelimit.limit(request, key="mt5sync", max_calls=60, window_secs=60)
    user = db.scalar(select(User).where(User.token == body.token.strip()))
    if not user:
        raise HTTPException(401, "invalid token")

    existing = set(
        db.scalars(select(RoundTrip.dedup_key).where(RoundTrip.user_id == user.id)).all()
    )
    stored = 0
    for t in body.trips:
        if t.dedup_key in existing:
            continue
        notional = t.entry_price * t.qty
        et = datetime.fromtimestamp(t.entry_time, tz=timezone.utc).replace(tzinfo=None)
        xt = datetime.fromtimestamp(t.exit_time, tz=timezone.utc).replace(tzinfo=None)
        db.add(RoundTrip(
            user_id=user.id, symbol=t.symbol[:32], qty=t.qty,
            entry_price=t.entry_price, exit_price=t.exit_price,
            entry_time=et, exit_time=xt, notional=notional, pnl=t.pnl,
            pnl_pct=(t.pnl / notional if notional else 0.0),
            hold_seconds=max(0, t.exit_time - t.entry_time), dedup_key=t.dedup_key[:80],
        ))
        existing.add(t.dedup_key)
        stored += 1
    db.commit()
    return {"ok": True, "stored": stored}


# All rule-engine state is DB-backed (OpenPosition + RoundTrip tables) so it
# survives Render restarts / spin-downs — never kept in process memory.
_FLAG_MESSAGES = {
    "No_Stop_Loss": "פתחת {symbol} בלי stop-loss. שים סטופ עכשיו — הפסד אחד בלי סטופ מוחק כמה רווחים.",
    "Revenge_Trade": "פתחת {symbol} זמן קצר אחרי הפסד. ייתכן מסחר נקמה — קח הפסקה לפני העסקה הבאה.",
    "Averaging_Down": "הוספת פוזיציה ב-{symbol} באותו כיוון בזמן שכבר יש לך פוזיציה פתוחה — מיצוע הפסד מסוכן.",
    "Risk_Overload": "החשיפה ב-{symbol} גבוהה מדי ביחס להון (מינוף אפקטיבי חריג). הקטן את הנפח.",
    "Overtrading_Bleed": "פתחת יותר מדי עסקאות ב-24 השעות האחרונות. מסחר יתר שוחק את החשבון בעמלות והחלטות נמהרות.",
    "Inverted_Time_Hold": "החזקת את העסקה המפסידה ב-{symbol} הרבה יותר זמן מהעסקאות המרוויחות שלך — אתה נותן להפסדים לרוץ וחותך רווחים מוקדם.",
    "Stop_Loss_Dragging": "הזזת את ה-stop-loss ב-{symbol} לכיוון הפסד גדול יותר. זו הזזת סטופ — אל תיתן להפסד לגדול.",
    "Negative_Risk_Reward": "הרווח הממוצע שלך קטן מחצי מההפסד הממוצע — תוחלת שלילית. גם אם תנצח לרוב, המתמטיקה נגדך.",
    "Margin_Danger": "ה-Free Margin נמוך מ-20% מההון — החשבון קרוב ל-Margin Call. סגור/הקטן פוזיציות.",
    "Weekend_Gap_Risk": "פתחת פוזיציה לקראת סגירת השבוע (שישי בערב). פער מחיר בפתיחת השבוע יכול לדלג מעל הסטופ.",
}


@app.post("/api/mt5/webhook")
def mt5_webhook(body: WebhookEventIn, request: Request, db: Session = Depends(get_db)):
    """Real-time trade event from the MentorTrade EA → live rule engine.

    The EA posts one transaction on every open/close (OnTradeTransaction). We
    flag the three costly mistakes (revenge / averaging-down / no-stop), store
    alerts + closed round-trips so the cloud dashboard fills, and return the
    flags. Read-only: we never send orders back.
    """
    ratelimit.limit(request, key="mt5webhook", max_calls=240, window_secs=60)
    user = db.scalar(select(User).where(User.token == body.token.strip()))
    if not user:
        log.warning("MT5 webhook: invalid token")
        return {"ok": False, "error": "invalid token"}

    now = datetime.utcnow()
    action = body.action.strip().lower()
    entry = body.entry.strip().lower()
    flags: list[str] = []

    if entry == "in":  # a position was opened
        if body.sl == 0.0:
            flags.append("No_Stop_Loss")

        # Revenge: most recent CLOSED losing trade within 15 min — queried from
        # the DB, so it still works after a server restart.
        last_loss = db.scalar(
            select(RoundTrip)
            .where(RoundTrip.user_id == user.id, RoundTrip.pnl < 0)
            .order_by(RoundTrip.exit_time.desc())
            .limit(1)
        )
        if last_loss and (now - last_loss.exit_time) <= timedelta(minutes=15):
            flags.append("Revenge_Trade")

        # Averaging down: a position is already open in the same symbol+direction
        # (read from the persisted open_positions table, not memory).
        prior = db.scalar(
            select(OpenPosition).where(
                OpenPosition.user_id == user.id,
                OpenPosition.symbol == body.symbol,
                OpenPosition.action == action,
            ).limit(1)
        )
        if prior:
            flags.append("Averaging_Down")

        # --- expanded quant-engine checks (on open) ---
        # Risk_Overload: effective leverage = notional / equity.
        if body.equity > 0 and body.notional > 0 and (body.notional / body.equity) > 30:
            flags.append("Risk_Overload")

        # Margin_Danger: free margin under 20% of equity (near a margin call).
        if body.equity > 0 and 0 < body.free_margin < 0.20 * body.equity:
            flags.append("Margin_Danger")

        # Weekend_Gap_Risk: opened Friday after 18:00 (server UTC).
        if now.weekday() == 4 and now.hour >= 18:
            flags.append("Weekend_Gap_Risk")

        # Overtrading_Bleed: >15 positions opened in the last 24h (closed + still-open).
        since = now - timedelta(hours=24)
        opened_24h = (
            (db.scalar(
                select(func.count(RoundTrip.id)).where(
                    RoundTrip.user_id == user.id, RoundTrip.entry_time >= since
                )
            ) or 0)
            + (db.scalar(
                select(func.count(OpenPosition.id)).where(
                    OpenPosition.user_id == user.id, OpenPosition.opened_at >= since
                )
            ) or 0)
        )
        if opened_24h > 15:
            flags.append("Overtrading_Bleed")

        # Negative_Risk_Reward: across the last 20 closed trades, avg win < 50% of avg loss.
        recent = db.scalars(
            select(RoundTrip)
            .where(RoundTrip.user_id == user.id)
            .order_by(RoundTrip.exit_time.desc())
            .limit(20)
        ).all()
        wins = [r.pnl for r in recent if r.pnl > 0]
        losses = [-r.pnl for r in recent if r.pnl < 0]
        if wins and losses:
            avg_win = sum(wins) / len(wins)
            avg_loss = sum(losses) / len(losses)
            if avg_loss > 0 and avg_win < 0.5 * avg_loss:
                flags.append("Negative_Risk_Reward")

        # upsert this open position (by user + position_id)
        existing = db.scalar(
            select(OpenPosition).where(
                OpenPosition.user_id == user.id,
                OpenPosition.position_id == body.position_id,
            )
        )
        if existing:
            existing.symbol = body.symbol
            existing.action = action
            existing.entry_price = body.price
            existing.volume = body.volume
            existing.sl = body.sl
            existing.opened_at = now
        else:
            db.add(OpenPosition(
                user_id=user.id, position_id=body.position_id, symbol=body.symbol,
                action=action, entry_price=body.price, volume=body.volume,
                sl=body.sl, opened_at=now,
            ))

    elif entry == "out":  # a position was closed
        opened = db.scalar(
            select(OpenPosition).where(
                OpenPosition.user_id == user.id,
                OpenPosition.position_id == body.position_id,
            )
        )
        # persist the closed round-trip so the dashboard stats fill
        dedup = f"wh-{body.position_id or body.deal_id}"
        if not db.scalar(
            select(RoundTrip).where(RoundTrip.user_id == user.id, RoundTrip.dedup_key == dedup)
        ):
            entry_price = opened.entry_price if opened else body.price
            entry_time = opened.opened_at if opened else now
            qty = (opened.volume if opened else body.volume) or body.volume
            notional = entry_price * qty
            db.add(RoundTrip(
                user_id=user.id, symbol=(body.symbol or "?")[:32], qty=qty,
                entry_price=entry_price, exit_price=body.price,
                entry_time=entry_time, exit_time=now, notional=notional,
                pnl=body.profit, pnl_pct=(body.profit / notional if notional else 0.0),
                hold_seconds=max(0, int((now - entry_time).total_seconds())),
                dedup_key=dedup[:80],
            ))
        # Inverted_Time_Hold: a losing trade held far longer than your winners.
        if body.profit < 0 and opened:
            hold = (now - opened.opened_at).total_seconds()
            avg_win_hold = db.scalar(
                select(func.avg(RoundTrip.hold_seconds)).where(
                    RoundTrip.user_id == user.id, RoundTrip.pnl > 0
                )
            )
            if avg_win_hold and hold > 3 * float(avg_win_hold):
                flags.append("Inverted_Time_Hold")

        if opened:
            db.delete(opened)

    elif entry == "modify":  # SL/TP changed on an already-open position
        opened = db.scalar(
            select(OpenPosition).where(
                OpenPosition.user_id == user.id,
                OpenPosition.position_id == body.position_id,
            )
        )
        if opened and opened.sl != 0.0:
            old_sl, new_sl = opened.sl, body.sl
            # "dragging" = the stop moved further from entry, enlarging the loss
            # (or removed entirely).
            dragged = (
                (opened.action == "buy" and (new_sl == 0.0 or new_sl < old_sl))
                or (opened.action == "sell" and (new_sl == 0.0 or new_sl > old_sl))
            )
            if dragged:
                flags.append("Stop_Loss_Dragging")
        if opened:
            opened.sl = body.sl  # remember the new stop

    # store + push an alert for every flag raised
    for flag in flags:
        msg = _FLAG_MESSAGES.get(flag, flag).format(symbol=body.symbol or "החשבון")
        dedup = f"wh|{flag}|{body.symbol}|{body.position_id}"
        if db.scalar(select(Alert).where(Alert.user_id == user.id, Alert.dedup_key == dedup)):
            continue
        alert = Alert(
            user_id=user.id, type=flag[:40], severity="warning",
            title="התראה חיה מ-MT5", message=msg,
            symbol=(body.symbol or None), dedup_key=dedup,
        )
        db.add(alert)
        if user.telegram_chat_id and telegram.send_message(user.telegram_chat_id, f"⚠️ {msg}"):
            alert.delivered = True

    db.commit()

    # prominent log line for observability
    if flags:
        log.warning("🚨 MT5 %s | user=%s %s %s @%.5f sl=%.5f pnl=%.2f | FLAGS: %s",
                    entry.upper(), user.email, action, body.symbol, body.price,
                    body.sl, body.profit, ", ".join(flags))
    else:
        log.info("MT5 %s | user=%s %s %s @%.5f (clean)",
                 entry.upper(), user.email, action, body.symbol, body.price)

    return {"ok": True, "flags": flags}


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


