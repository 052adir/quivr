"""Telegram bot worker.

Two jobs:
  1. Lead capture — anyone who opens the bot (/start) becomes a lead, carrying
     an affiliate ref from the deep-link payload.
  2. Account linking — a logged-in user links their Telegram chat to their
     Mentor account (via a one-time code) so alerts push to them automatically.

`process_update` is pure-ish (DB in, reply out) so it's unit-testable without
the network; `poll_loop` drives it via long-polling.
"""

import logging
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import telegram
from .config import settings
from .database import SessionLocal
from .models import Lead, User

log = logging.getLogger("mentor.telegram")

WELCOME = (
    "ברוך הבא למנטור 📈\n\n"
    "אני מאמן המסחר האישי שלך — אשלח לך כאן התראות בזמן אמת על הטעויות "
    "והניצחונות שלך.\n\n"
    "כדי לחבר את החשבון שלך, הפק קוד באפליקציה (מסך \"חיבור והגדרות\") "
    "ושלח לי:\n<code>/link הקוד-שלך</code>\n\n"
    "אין לך עדיין חשבון? התחל 7 ימי ניסיון חינם 👉"
)
HELP = (
    "פקודות:\n"
    "<code>/link CODE</code> — חבר את חשבון המנטור שלך (הקוד מהאפליקציה)\n"
    "<code>/help</code> — עזרה"
)


def process_update(db: Session, update: dict) -> tuple[int, str] | None:
    """Handle one Telegram update. Returns (chat_id, reply_text) or None."""
    msg = update.get("message") or update.get("edited_message")
    if not msg:
        return None
    chat_id = msg.get("chat", {}).get("id")
    from_id = msg.get("from", {}).get("id")
    text = (msg.get("text") or "").strip()
    if chat_id is None:
        return None

    if text.startswith("/start"):
        payload = _arg(text)
        if payload.startswith("link-") or payload.startswith("link_"):
            return _link(db, chat_id, payload[5:])
        _capture_lead(db, from_id, ref=payload or None)
        return (chat_id, WELCOME)

    if text.startswith("/link"):
        code = _arg(text)
        if not code:
            return (chat_id, "שלח: <code>/link הקוד-שלך</code> (הקוד מהאפליקציה).")
        return _link(db, chat_id, code)

    return (chat_id, HELP)


def _arg(text: str) -> str:
    parts = text.split(maxsplit=1)
    return parts[1].strip() if len(parts) > 1 else ""


def _link(db: Session, chat_id: int, code: str) -> tuple[int, str]:
    user = db.scalar(select(User).where(User.telegram_link_code == code))
    if not user:
        return (chat_id, "❌ קוד לא תקין או שכבר נוצל. הפק קוד חדש באפליקציה.")
    user.telegram_chat_id = str(chat_id)
    user.telegram_link_code = None  # one-time use
    db.commit()
    return (chat_id, f"✅ חובר בהצלחה, {user.email}!\nמעכשיו תקבל כאן התראות בזמן אמת.")


def _capture_lead(db: Session, from_id, ref: str | None) -> None:
    phone = f"tg:{from_id}" if from_id else None
    if phone and db.scalar(select(Lead).where(Lead.phone == phone)):
        return  # already captured
    db.add(Lead(phone=phone, source="telegram_bot", ref_code=ref))
    db.commit()


def poll_loop() -> None:
    if not settings.telegram_bot_token:
        return
    log.info("telegram bot polling started")
    offset: int | None = None
    while True:
        try:
            updates = telegram.get_updates(offset)
        except Exception:
            log.exception("getUpdates failed")
            time.sleep(5)
            continue
        for update in updates:
            offset = update["update_id"] + 1
            db = SessionLocal()
            try:
                result = process_update(db, update)
                if result:
                    telegram.send_message(str(result[0]), result[1])
            except Exception:
                log.exception("error handling update")
            finally:
                db.close()
