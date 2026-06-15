"""Subscription / trial access logic — the paywall gate."""

from datetime import datetime, timedelta, timezone

from .config import settings
from .models import User


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def start_trial(user: User) -> None:
    """Called at registration: begin the free trial window."""
    user.subscription_status = "trialing"
    user.trial_ends_at = _utcnow() + timedelta(days=settings.trial_days)


def state(user: User) -> dict:
    """Return the user's current access state for UI + gating."""
    now = _utcnow()
    if user.subscription_status == "active":
        return {"active": True, "status": "active", "trial_days_left": None}

    if user.subscription_status == "trialing" and user.trial_ends_at:
        if now < user.trial_ends_at:
            secs_left = (user.trial_ends_at - now).total_seconds()
            return {
                "active": True,
                "status": "trialing",
                "trial_days_left": max(1, int((secs_left + 86399) // 86400)),
                "trial_ends_at": user.trial_ends_at.isoformat(),
            }
        return {"active": False, "status": "trial_expired", "trial_days_left": 0}

    return {"active": False, "status": user.subscription_status, "trial_days_left": 0}


def has_access(user: User) -> bool:
    return state(user)["active"]
