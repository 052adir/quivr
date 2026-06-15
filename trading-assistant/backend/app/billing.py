"""Stripe subscription billing.

Guarded so the app runs fully without Stripe configured (trial-only mode).
When STRIPE_SECRET_KEY + STRIPE_PRICE_ID are set, real Checkout + webhooks
take over.
"""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import User

log = logging.getLogger("mentor.billing")


def _stripe():
    import stripe  # imported lazily so the dep is optional at runtime

    stripe.api_key = settings.stripe_secret_key
    return stripe


def create_checkout_session(user: User) -> str:
    """Return a Stripe Checkout URL for the subscription. Raises if unconfigured."""
    if not settings.billing_enabled:
        raise RuntimeError("billing not configured")
    stripe = _stripe()
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
        customer_email=user.email,
        client_reference_id=str(user.id),
        success_url=f"{settings.app_base_url}/app?billing=success",
        cancel_url=f"{settings.app_base_url}/app?billing=cancel",
        allow_promotion_codes=True,
    )
    return session.url


def verify_and_parse_webhook(payload: bytes, signature: str):
    """Verify the Stripe signature and return the event (or raise)."""
    stripe = _stripe()
    return stripe.Webhook.construct_event(
        payload, signature, settings.stripe_webhook_secret
    )


def apply_webhook_event(db: Session, event: dict) -> None:
    """Update subscription state from a Stripe webhook event."""
    etype = event.get("type", "")
    obj = event.get("data", {}).get("object", {})

    if etype == "checkout.session.completed":
        user = _user_from_ref(db, obj.get("client_reference_id"))
        if user:
            user.subscription_status = "active"
            user.stripe_customer_id = obj.get("customer")
            user.stripe_subscription_id = obj.get("subscription")
            db.commit()
            log.info("user %s -> active (checkout)", user.id)

    elif etype in ("customer.subscription.deleted", "customer.subscription.canceled"):
        user = _user_from_customer(db, obj.get("customer"))
        if user:
            user.subscription_status = "canceled"
            db.commit()
            log.info("user %s -> canceled", user.id)

    elif etype == "invoice.payment_failed":
        user = _user_from_customer(db, obj.get("customer"))
        if user:
            user.subscription_status = "past_due"
            db.commit()
            log.info("user %s -> past_due", user.id)


def _user_from_ref(db: Session, ref: str | None) -> User | None:
    if not ref:
        return None
    try:
        return db.get(User, int(ref))
    except (ValueError, TypeError):
        return None


def _user_from_customer(db: Session, customer_id: str | None) -> User | None:
    if not customer_id:
        return None
    return db.scalar(select(User).where(User.stripe_customer_id == customer_id))
