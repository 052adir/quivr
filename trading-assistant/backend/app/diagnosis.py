"""Beginner-friendly diagnosis.

Turns the whole trade history into ONE plain-language verdict a total novice
can act on: what you do well, the single biggest problem, why it matters (with
a real-life analogy), and the one concrete thing to do on the next trade.

Uses dollars only (accurate for crypto *and* forex/MT5) — never the per-trade
percentage, which isn't meaningful for forex/CFD.
"""


def _usd(v: float) -> str:
    v = round(v)
    return f"רווח של ${v:,}" if v >= 0 else f"הפסד של ${abs(v):,}"


def build_diagnosis(trips: list, account_size: float) -> dict:
    n = len(trips)
    if n == 0:
        return {
            "kind": "empty",
            "headline": "עוד אין מספיק עסקאות לנתח",
            "good_news": "",
            "money": "ברגע שתסגור כמה עסקאות, אנתח אותן ואראה לך בדיוק מה לשפר.",
            "problem": "",
            "analogy": "",
            "action_title": "מה לעשות",
            "steps": ["סחור כרגיל — אני אצפה ואלמד את הדפוסים שלך אוטומטית."],
            "stats": {},
        }

    wins = [t for t in trips if t.pnl > 0]
    losses = [t for t in trips if t.pnl <= 0]
    total = sum(t.pnl for t in trips)
    gross_win = sum(t.pnl for t in wins)
    gross_loss = -sum(t.pnl for t in losses)
    avg_win = gross_win / len(wins) if wins else 0.0
    avg_loss = gross_loss / len(losses) if losses else 0.0  # positive number
    win_rate = len(wins) / n
    best = max(trips, key=lambda t: t.pnl)
    worst = min(trips, key=lambda t: t.pnl)

    stats = {
        "trades": n,
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(win_rate * 100),
        "total_pnl": round(total, 2),
        "avg_win": round(avg_win),
        "avg_loss": round(avg_loss),
        "best": {"symbol": best.symbol, "pnl": round(best.pnl)},
        "worst": {"symbol": worst.symbol, "pnl": round(worst.pnl)},
    }
    money = (
        f"{n} עסקאות: ניצחת ב-{len(wins)} והפסדת ב-{len(losses)}. סה\"כ {_usd(total)}."
    )
    good_news = (
        f"כשאתה מנצח אתה מנצח יפה — העסקה הכי טובה שלך הייתה {best.symbol} עם "
        f"{_usd(best.pnl)}. יש לך יכולת לבחור עסקאות טובות."
    )

    # --- profitable ---
    if total >= 0:
        return {
            "kind": "profitable",
            "headline": "כל הכבוד — אתה ברווח 🎉",
            "good_news": good_news,
            "money": money,
            "problem": "אין בעיה בוערת. המשימה עכשיו: לשמור על מה שעובד ולא להתפזר.",
            "analogy": "כמו ספורטאי שמנצח — לא משנים את מה שעובד, שומרים על שגרה.",
            "action_title": "איך לשמור על הרווח",
            "steps": [
                "המשך עם אותו גודל עסקה בכל פעם — אל תגדיל כי אתה 'חם'.",
                "שים stop-loss בכל עסקה, גם כשאתה בטוח.",
                "אם יום אחד אתה מרגיש שאתה 'נוקם' אחרי הפסד — עצור ליום.",
            ],
            "stats": stats,
        }

    # --- losing: which problem dominates? ---
    breakeven = avg_loss / (avg_win + avg_loss) if (avg_win + avg_loss) > 0 else 1.0

    # Losses clearly bigger than wins -> the problem is loss size (cut losers).
    if losses and avg_loss > avg_win * 1.15:
        return {
            "kind": "losses_bigger",
            "headline": "הבעיה: ההפסדים שלך גדולים מהרווחים",
            "good_news": good_news,
            "money": (
                f"{money} בעסקה מנצחת אתה מרוויח בממוצע ${round(avg_win):,}, "
                f"אבל בעסקה מפסידה אתה מפסיד בממוצע ${round(avg_loss):,} — יותר. "
                f"זאת כל הבעיה."
            ),
            "problem": (
                "אתה נותן להפסדים לגדול במקום לחתוך אותם מוקדם. הפסד אחד גדול "
                "מוחק כמה רווחים קטנים."
            ),
            "analogy": (
                "תחשוב על זה ככה: אתה מרוויח שקל כשאתה צודק, אבל מפסיד שני שקלים "
                "כשאתה טועה. גם אם תצדק בחצי מהפעמים — תישאר במינוס. הפתרון הוא "
                "להקטין את ההפסד, לא לצדוק יותר."
            ),
            "action_title": "מה לעשות בעסקה הבאה — צעד אחד",
            "steps": [
                "לפני שאתה פותח עסקה, החלט: 'אם המחיר יגיע לכאן — אני יוצא'. זה stop-loss.",
                "בפלטפורמה יש שדה Stop Loss (S/L). שים בו מחיר שמרחיק ממך לא יותר מ-1%–2% מההון.",
                "כשהמחיר נוגע ב-stop — צא. אל תזיז אותו 'אולי יחזור'. זה הכלל היחיד שמפריד בין מי ששורד למי שנשרף.",
            ],
            "stats": stats,
        }

    # Wins are decent-sized but win rate too low -> be more selective.
    return {
        "kind": "be_selective",
        "headline": "אתה ממש קרוב לרווח — חסר דבר אחד",
        "good_news": good_news,
        "money": (
            f"{money} הרווח הממוצע שלך לעסקה (${round(avg_win):,}) דווקא גדול "
            f"מההפסד הממוצע (${round(avg_loss):,}). אתה רק מפסיד יותר מדי פעמים — "
            f"ניצחת ב-{stats['win_rate']}% מהעסקאות."
        ),
        "problem": (
            "אתה נכנס ליותר מדי עסקאות 'בינוניות'. הרווחים שלך טובים — אם רק "
            "היית בוחר עסקאות בקפידה, היית עובר לרווח."
        ),
        "analogy": (
            "כמו דייג: אם תזרוק את החכה לכל מקום, תתפוס בעיקר אצות. אם תחכה למקום "
            "הנכון — תתפוס דגים. במסחר זה אותו דבר: פחות עסקאות, אבל טובות."
        ),
        "action_title": "מה לעשות בעסקה הבאה — צעד אחד",
        "steps": [
            "לפני כל עסקה תן לה ציון 1–10. תיכנס רק אם זה 8 ומעלה.",
            "הגבל את עצמך ל-2–3 עסקאות ביום. לא יותר.",
            "אם אתה משועמם ומחפש 'משהו לעשות' — זה בדיוק הזמן לא לסחור.",
        ],
        "stats": stats,
    }
