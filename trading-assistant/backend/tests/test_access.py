"""Subscription/trial gating logic."""

from datetime import datetime, timedelta
from types import SimpleNamespace

from app import access


def _user(status="trialing", trial_offset_days=7):
    ends = None
    if trial_offset_days is not None:
        ends = datetime.utcnow() + timedelta(days=trial_offset_days)
    return SimpleNamespace(subscription_status=status, trial_ends_at=ends)


def test_active_subscription_has_access():
    st = access.state(_user(status="active"))
    assert st["active"] is True
    assert st["status"] == "active"


def test_trial_in_window_has_access():
    st = access.state(_user(status="trialing", trial_offset_days=5))
    assert st["active"] is True
    assert st["status"] == "trialing"
    assert st["trial_days_left"] >= 1


def test_expired_trial_blocked():
    st = access.state(_user(status="trialing", trial_offset_days=-1))
    assert st["active"] is False
    assert st["status"] == "trial_expired"


def test_canceled_blocked():
    st = access.state(_user(status="canceled", trial_offset_days=None))
    assert st["active"] is False
