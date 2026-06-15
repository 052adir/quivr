"""Beginner diagnosis selects the right plain-language verdict."""

from types import SimpleNamespace

from app.diagnosis import build_diagnosis


def trip(pnl, symbol="BTCUSD"):
    return SimpleNamespace(pnl=pnl, symbol=symbol)


def test_empty():
    assert build_diagnosis([], 1000)["kind"] == "empty"


def test_profitable():
    trips = [trip(100), trip(80), trip(-30)]  # net +150
    dx = build_diagnosis(trips, 1000)
    assert dx["kind"] == "profitable"
    assert dx["steps"]


def test_losses_bigger():
    # small wins, big losses -> loss size is the problem
    trips = [trip(10), trip(10), trip(10), trip(-50), trip(-50), trip(-50)]
    dx = build_diagnosis(trips, 1000)
    assert dx["kind"] == "losses_bigger"


def test_be_selective():
    # wins bigger than losses, but loses too often (33% win rate) -> selectivity
    trips = [trip(135), trip(135), trip(-78), trip(-78), trip(-78), trip(-78)]
    dx = build_diagnosis(trips, 1000)
    assert dx["kind"] == "be_selective"
    assert "ציון" in " ".join(dx["steps"])  # the "score each trade" action


def test_output_shape():
    dx = build_diagnosis([trip(10), trip(-50), trip(-50)], 1000)
    for key in ("headline", "money", "action_title", "steps", "stats"):
        assert key in dx
    assert dx["stats"]["trades"] == 3
