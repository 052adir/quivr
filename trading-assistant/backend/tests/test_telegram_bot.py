"""Telegram bot update handling: lead capture + account linking."""

from sqlalchemy import select

from app import telegram_bot
from app.database import SessionLocal
from app.models import Lead, User
from app.security import hash_password, new_token


def _update(text, chat_id=555, from_id=999):
    return {
        "update_id": 1,
        "message": {"chat": {"id": chat_id}, "from": {"id": from_id}, "text": text},
    }


def _seed_user(link_code="abc123"):
    db = SessionLocal()
    user = User(
        email="tg@t.com",
        password_hash=hash_password("secret123"),
        token=new_token(),
        telegram_link_code=link_code,
    )
    db.add(user)
    db.commit()
    uid = user.id
    db.close()
    return uid


def test_start_captures_lead_with_ref():
    db = SessionLocal()
    chat, reply = telegram_bot.process_update(db, _update("/start DAVID", from_id=777))
    db.close()
    assert chat == 555
    assert "מנטור" in reply

    db = SessionLocal()
    lead = db.scalar(select(Lead).where(Lead.phone == "tg:777"))
    assert lead is not None
    assert lead.source == "telegram_bot"
    assert lead.ref_code == "DAVID"
    db.close()


def test_link_via_command():
    uid = _seed_user("code42")
    db = SessionLocal()
    chat, reply = telegram_bot.process_update(db, _update("/link code42", chat_id=12345))
    db.close()
    assert "חובר בהצלחה" in reply

    db = SessionLocal()
    user = db.get(User, uid)
    assert user.telegram_chat_id == "12345"
    assert user.telegram_link_code is None  # one-time use consumed
    db.close()


def test_link_via_start_deeplink():
    uid = _seed_user("deep99")
    db = SessionLocal()
    _, reply = telegram_bot.process_update(db, _update("/start link-deep99", chat_id=222))
    db.close()
    assert "חובר בהצלחה" in reply
    db = SessionLocal()
    assert db.get(User, uid).telegram_chat_id == "222"
    db.close()


def test_invalid_code():
    db = SessionLocal()
    _, reply = telegram_bot.process_update(db, _update("/link nope"))
    db.close()
    assert "לא תקין" in reply


def test_help_fallback():
    db = SessionLocal()
    _, reply = telegram_bot.process_update(db, _update("שלום"))
    db.close()
    assert "/link" in reply


def test_connect_endpoint_issues_code(client):
    tok = client.post(
        "/api/auth/register", json={"email": "c@t.com", "password": "secret123"}
    ).json()["token"]
    r = client.post("/api/telegram/connect", headers={"Authorization": f"Bearer {tok}"}).json()
    assert r["code"] and len(r["code"]) >= 4
    assert r["bot_configured"] is False  # no token in tests
    assert r["linked"] is False
