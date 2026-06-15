"""MentorGuard desktop watcher — the no-fuss, double-click coach.

A standalone program (packaged as MentorGuard.exe) that attaches to the user's
already-running MetaTrader 5 terminal, watches their OPEN positions in real
time, and pops a Windows notification the moment they make a costly mistake:
trading with no stop-loss, risking too much, or revenge trading.

It is READ-ONLY — it never opens, modifies, or closes any trade.

No MetaEditor, no compiling, no file copying. The user just runs the .exe while
MT5 is open. Optional: a mentor_watcher.ini next to the exe can add a webhook so
alerts also reach Telegram / the Mentor app.
"""

import configparser
import os
import sys
import time
from datetime import datetime, timedelta

try:
    import MetaTrader5 as mt5
except Exception:  # pragma: no cover - only on non-Windows/dev machines
    mt5 = None

try:
    from winotify import Notification
    _HAS_TOAST = True
except Exception:
    _HAS_TOAST = False

POLL_SECONDS = 5


def _config() -> dict:
    """Read optional mentor_watcher.ini sitting next to the program."""
    base = os.path.dirname(sys.executable if getattr(sys, "frozen", False) else __file__)
    cfg = configparser.ConfigParser()
    defaults = {
        "max_risk_pct": "2.0",
        "grace_seconds": "60",
        "revenge_minutes": "30",
        "backend_url": "",
        "token": "",
    }
    path = os.path.join(base, "mentor_watcher.ini")
    if os.path.exists(path):
        cfg.read(path, encoding="utf-8")
        if cfg.has_section("mentor"):
            for k in defaults:
                if cfg.has_option("mentor", k):
                    defaults[k] = cfg.get("mentor", k)
    return defaults


def toast(title: str, msg: str) -> None:
    print(f"  >> {title}: {msg}")
    if _HAS_TOAST:
        try:
            n = Notification(app_id="MentorGuard", title=title, msg=msg, duration="long")
            n.show()
        except Exception:
            pass


def post_backend(cfg: dict, type_: str, symbol: str, ref, message: str) -> None:
    url, token = cfg["backend_url"].strip(), cfg["token"].strip()
    if not url or not token:
        return
    import json
    import urllib.request

    body = json.dumps({
        "token": token, "type": type_, "symbol": symbol,
        "ref": str(ref), "message": message,
    }).encode("utf-8")
    req = urllib.request.Request(url, data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass


def risk_money(symbol: str, open_price: float, sl: float, vol: float) -> float:
    info = mt5.symbol_info(symbol)
    if not info or not info.trade_tick_size:
        return 0.0
    ticks = abs(open_price - sl) / info.trade_tick_size
    return ticks * info.trade_tick_value * vol


def main() -> None:
    print("=" * 56)
    print("  מנטור — שומר המסחר שלך פעיל. (קריאה בלבד, לא סוחר.)")
    print("  השאר את החלון פתוח בזמן המסחר. לסגירה: סגור את החלון.")
    print("=" * 56)

    if mt5 is None:
        print("MetaTrader5 לא זמין במכונה הזו.")
        input("הקש Enter ליציאה...")
        return

    cfg = _config()
    max_risk = float(cfg["max_risk_pct"])
    grace = int(cfg["grace_seconds"])
    revenge_min = int(cfg["revenge_minutes"])

    warned_nostop: set = set()
    warned_oversized: set = set()
    seen_deals: set = set()
    last_loss_close = None

    while True:
        if not mt5.initialize():
            print("ממתין ל-MT5... ודא שהטרמינל פתוח ומחובר.")
            time.sleep(POLL_SECONDS)
            continue

        # --- revenge: scan recent closing deals for losses + new opens ---
        deals = mt5.history_deals_get(datetime.now() - timedelta(hours=12), datetime.now())
        if deals:
            for d in deals:
                if d.ticket in seen_deals:
                    continue
                seen_deals.add(d.ticket)
                if d.entry == mt5.DEAL_ENTRY_OUT and d.profit < 0:
                    last_loss_close = datetime.now()
                elif d.entry == mt5.DEAL_ENTRY_IN and last_loss_close:
                    gap = (datetime.now() - last_loss_close).total_seconds() / 60
                    if gap <= revenge_min:
                        msg = (f"פתחת {d.symbol} רק {int(gap)} דקות אחרי הפסד — "
                               f"זה מסחר נקמה, הדפוס שהכי פוגע. קח הפסקה.")
                        toast("🛑 מסחר נקמה", msg)
                        post_backend(cfg, "revenge_trade", d.symbol, d.position_id, msg)

        # --- open positions: no-stop + oversized ---
        positions = mt5.positions_get() or []
        for p in positions:
            grace_passed = (datetime.now().timestamp() - p.time) >= grace
            if p.sl == 0.0 and grace_passed and p.ticket not in warned_nostop:
                msg = (f"פתחת {p.symbol} בלי stop-loss. שים סטופ עכשיו — "
                       f"הפסד אחד בלי סטופ מוחק כמה רווחים.")
                toast("⚠️ אין stop-loss", msg)
                post_backend(cfg, "no_stop_loss", p.symbol, p.ticket, msg)
                warned_nostop.add(p.ticket)
            elif p.sl != 0.0 and p.ticket not in warned_oversized:
                bal = mt5.account_info().balance if mt5.account_info() else 0
                risk = risk_money(p.symbol, p.price_open, p.sl, p.volume)
                if bal > 0 and risk > bal * max_risk / 100:
                    msg = (f"הסיכון ב-{p.symbol} הוא כ-${risk:,.0f} — מעל {max_risk:.0f}% "
                           f"מההון. הקטן פוזיציה או קרב את הסטופ.")
                    toast("⚠️ סיכון גבוה", msg)
                    post_backend(cfg, "oversized", p.symbol, p.ticket, msg)
                    warned_oversized.add(p.ticket)

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as exc:  # keep the window open so the user sees the error
        print(f"שגיאה: {exc}")
        input("הקש Enter ליציאה...")
