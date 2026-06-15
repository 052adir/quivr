"""Stripe webhook -> subscription state transitions (end-to-end logic)."""

from sqlalchemy import select

from app import billing
from app.database import SessionLocal
from app.models import User


def _make_user(client) -> int:
    r = client.post("/api/auth/register", json={"email": "buy@t.com", "password": "secret123"})
    token = r.json()["token"]
    db = SessionLocal()
    uid = db.scalar(select(User.id).where(User.token == token))
    db.close()
    return uid


def test_checkout_completed_activates(client):
    uid = _make_user(client)
    db = SessionLocal()
    billing.apply_webhook_event(
        db,
        {
            "type": "checkout.session.completed",
            "data": {"object": {
                "client_reference_id": str(uid),
                "customer": "cus_123",
                "subscription": "sub_123",
            }},
        },
    )
    user = db.get(User, uid)
    assert user.subscription_status == "active"
    assert user.stripe_customer_id == "cus_123"
    assert user.stripe_subscription_id == "sub_123"
    db.close()


def test_subscription_deleted_cancels(client):
    uid = _make_user(client)
    db = SessionLocal()
    # First activate so we have a customer id to match on.
    billing.apply_webhook_event(db, {
        "type": "checkout.session.completed",
        "data": {"object": {"client_reference_id": str(uid), "customer": "cus_9", "subscription": "sub_9"}},
    })
    billing.apply_webhook_event(db, {
        "type": "customer.subscription.deleted",
        "data": {"object": {"customer": "cus_9"}},
    })
    assert db.get(User, uid).subscription_status == "canceled"
    db.close()


def test_payment_failed_marks_past_due(client):
    uid = _make_user(client)
    db = SessionLocal()
    billing.apply_webhook_event(db, {
        "type": "checkout.session.completed",
        "data": {"object": {"client_reference_id": str(uid), "customer": "cus_x", "subscription": "sub_x"}},
    })
    billing.apply_webhook_event(db, {
        "type": "invoice.payment_failed",
        "data": {"object": {"customer": "cus_x"}},
    })
    assert db.get(User, uid).subscription_status == "past_due"
    db.close()
