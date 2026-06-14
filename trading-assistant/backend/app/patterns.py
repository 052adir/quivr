"""The coaching engine: turn closed round-trips into personalized alerts.

Everything here is rule-based and education-only — it explains habits, it never
tells the user to buy or sell anything. Messages are in Hebrew (the product's
audience). Each alert carries a stable dedup_key so re-runs don't duplicate.
"""

import statistics
from datetime import timedelta

_ZERO = timedelta(0)

# Tunable thresholds for the universal beginner-mistake rules.
LARGE_LOSS_PCT = -0.08            # a single trade losing >8% looks like "no stop-loss"
REVENGE_WINDOW = timedelta(minutes=30)
OVERSIZED_MULTIPLE = 2.0          # position vs. the trader's own median
OVERSIZED_ACCOUNT_FRACTION = 0.5  # or more than half the account in one trade
OVERTRADING_PER_DAY = 6
WIN_PCT = 0.025                   # a clean win worth celebrating
WIN_STREAK = 3


def detect(trips: list, account_size: float) -> list[dict]:
    """trips: ORM RoundTrip objects. Returns a list of alert dicts."""
    if not trips:
        return []

    by_exit = sorted(trips, key=lambda t: t.exit_time)
    by_entry = sorted(trips, key=lambda t: t.entry_time)
    notionals = [t.notional for t in trips]
    median_notional = statistics.median(notionals) if notionals else 0.0

    alerts: list[dict] = []

    # --- Per-trade rules ---
    streak = 0
    for t in by_exit:
        pct = t.pnl_pct * 100

        if t.pnl_pct <= LARGE_LOSS_PCT:
            alerts.append(
                _a(
                    "no_stop_loss", "warning", t.symbol, t.dedup_key,
                    "הפסד גדול בעסקה בודדת",
                    f"ב-{t.symbol} ספגת הפסד של {pct:.1f}% בעסקה אחת. הפסד בסדר גודל "
                    f"כזה הוא בדרך כלל סימן שלא היה stop-loss מוגדר. הגדרת סטופ מראש "
                    f"היא ההרגל שהכי שומר על החשבון.",
                )
            )

        if median_notional > 0 and t.notional >= median_notional * OVERSIZED_MULTIPLE:
            alerts.append(
                _a(
                    "oversized", "warning", t.symbol, t.dedup_key,
                    "פוזיציה גדולה מהרגיל",
                    f"הפוזיציה ב-{t.symbol} (כ-${t.notional:,.0f}) הייתה גדולה בהרבה "
                    f"מהממוצע שלך. הגדלה לא עקבית של הסיכון היא דפוס שמגדיל תנודתיות "
                    f"בחשבון. שקול גודל פוזיציה קבוע ביחס להון.",
                )
            )
        elif account_size > 0 and t.notional >= account_size * OVERSIZED_ACCOUNT_FRACTION:
            alerts.append(
                _a(
                    "oversized", "warning", t.symbol, t.dedup_key,
                    "סיכון גבוה בעסקה אחת",
                    f"שמת כ-${t.notional:,.0f} בעסקה אחת ב-{t.symbol} — יותר מחצי "
                    f"מההון שהגדרת. ריכוז כזה חושף את החשבון לסיכון גדול.",
                )
            )

        if t.pnl_pct >= WIN_PCT:
            streak += 1
            alerts.append(
                _a(
                    "good_win", "success", t.symbol, t.dedup_key,
                    "עסקה מנצחת לפי התוכנית",
                    f"יפה! יצאת ב-{t.symbol} ברווח של {pct:.1f}%. ככה נראית עסקה "
                    f"ממושמעת — לקחת רווח לפי תוכנית.",
                )
            )
            if streak == WIN_STREAK:
                alerts.append(
                    _a(
                        "win_streak", "success", t.symbol,
                        f"streak|{t.dedup_key}",
                        "רצף של 3 ניצחונות",
                        "3 עסקאות מנצחות ברצף. שמור על אותו גודל פוזיציה ואותה "
                        "משמעת — אל תגדיל סיכון רק כי אתה 'חם'.",
                    )
                )
        else:
            streak = 0

    # --- Revenge trading: a fresh entry right after a losing close ---
    for prev, nxt in zip(by_exit, by_exit[1:]):
        if prev.pnl < 0 and _ZERO <= (nxt.entry_time - prev.exit_time) <= REVENGE_WINDOW:
            gap_min = int((nxt.entry_time - prev.exit_time).total_seconds() // 60)
            alerts.append(
                _a(
                    "revenge_trade", "warning", nxt.symbol,
                    f"revenge|{nxt.dedup_key}",
                    "מסחר נקמה (revenge trade)",
                    f"פתחת עסקה חדשה ב-{nxt.symbol} רק {gap_min} דקות אחרי הפסד. "
                    f"כניסה מהירה אחרי הפסד היא הדפוס שהכי פוגע בסוחרים מתחילים — "
                    f"קח הפסקה קצרה לפני העסקה הבאה.",
                )
            )

    # --- Overtrading: too many closed trades in one day ---
    by_day: dict = {}
    for t in by_entry:
        by_day.setdefault(t.entry_time.date(), []).append(t)
    for day, day_trips in by_day.items():
        if len(day_trips) > OVERTRADING_PER_DAY:
            alerts.append(
                _a(
                    "overtrading", "warning", None, f"overtrading|{day.isoformat()}",
                    "יותר מדי עסקאות ביום אחד",
                    f"ב-{day.isoformat()} ביצעת {len(day_trips)} עסקאות. מסחר יתר "
                    f"שוחק עמלות וריכוז. לרוב פחות עסקאות איכותיות עדיף.",
                )
            )

    # --- Holding losers longer than winners (aggregate insight) ---
    wins = [t for t in trips if t.pnl > 0]
    losses = [t for t in trips if t.pnl <= 0]
    if len(wins) >= 3 and len(losses) >= 3:
        avg_win_hold = statistics.mean(t.hold_seconds for t in wins)
        avg_loss_hold = statistics.mean(t.hold_seconds for t in losses)
        if avg_loss_hold > avg_win_hold * 1.5:
            alerts.append(
                _a(
                    "hold_losers", "info", None, "insight|hold_losers",
                    "מחזיק מפסידות, חותך מנצחות",
                    f"בממוצע אתה מחזיק עסקאות מפסידות פי "
                    f"{avg_loss_hold / max(avg_win_hold, 1):.1f} יותר זמן מהמנצחות. "
                    f"זה דפוס קלאסי — תן לרווחים לרוץ וחתוך הפסדים מהר.",
                )
            )

    return alerts


def _a(type_, severity, symbol, dedup_suffix, title, message) -> dict:
    return {
        "type": type_,
        "severity": severity,
        "symbol": symbol,
        "title": title,
        "message": message,
        "dedup_key": f"{type_}|{dedup_suffix}",
    }
