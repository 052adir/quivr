"""MentorGuard — desktop trading guard with a live window (read-only).

A standalone GUI app (packaged as MentorGuard.exe). Double-click it while
MetaTrader 5 is open and it shows a live window: connection status, your open
positions with stop-loss indicators, and a log of real-time alerts when you
trade without a stop, risk too much, or revenge trade. It also pops Windows
notifications. It NEVER trades.

No MetaEditor, no compiling, no MT5 folders — it attaches to the running MT5
terminal via the official API. An optional mentor_watcher.ini next to the exe
adds a webhook so alerts also reach Telegram / the Mentor app.
"""

import configparser
import os
import subprocess
import sys
import tkinter as tk
from datetime import datetime, timedelta
from tkinter import ttk

try:
    import MetaTrader5 as mt5
except Exception:
    mt5 = None

try:
    from winotify import Notification
    _HAS_TOAST = True
except Exception:
    _HAS_TOAST = False

POLL_MS = 5000


def _base_dir() -> str:
    return os.path.dirname(sys.executable if getattr(sys, "frozen", False) else __file__)


def _config() -> dict:
    cfg = configparser.ConfigParser()
    defaults = {"max_risk_pct": "2.0", "grace_seconds": "60",
                "revenge_minutes": "30", "backend_url": "", "token": ""}
    path = os.path.join(_base_dir(), "mentor_watcher.ini")
    if os.path.exists(path):
        cfg.read(path, encoding="utf-8")
        if cfg.has_section("mentor"):
            for k in defaults:
                if cfg.has_option("mentor", k):
                    defaults[k] = cfg.get("mentor", k)
    return defaults


def _toast(title: str, msg: str) -> None:
    if _HAS_TOAST:
        try:
            Notification(app_id="MentorGuard", title=title, msg=msg, duration="long").show()
        except Exception:
            pass


def _post_backend(cfg: dict, type_: str, symbol: str, ref, message: str) -> None:
    url, token = cfg["backend_url"].strip(), cfg["token"].strip()
    if not url or not token:
        return
    import json
    import urllib.request
    body = json.dumps({"token": token, "type": type_, "symbol": symbol,
                       "ref": str(ref), "message": message}).encode("utf-8")
    try:
        urllib.request.urlopen(
            urllib.request.Request(url, data=body,
                                   headers={"Content-Type": "application/json"}),
            timeout=5)
    except Exception:
        pass


def _risk_money(symbol, open_price, sl, vol) -> float:
    info = mt5.symbol_info(symbol)
    if not info or not info.trade_tick_size:
        return 0.0
    return abs(open_price - sl) / info.trade_tick_size * info.trade_tick_value * vol


class GuardApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.cfg = _config()
        self.max_risk = float(self.cfg["max_risk_pct"])
        self.grace = int(self.cfg["grace_seconds"])
        self.revenge_min = int(self.cfg["revenge_minutes"])
        self.warned_nostop: set = set()
        self.warned_oversized: set = set()
        self.seen_deals: set = set()
        self.last_loss_close = None

        root.title("מנטור — שומר המסחר")
        root.geometry("560x520")
        root.configure(bg="#0b1020")

        tk.Label(root, text="מנטור 📈  שומר המסחר", font=("Segoe UI", 16, "bold"),
                 fg="#6ee7b7", bg="#0b1020").pack(pady=(14, 2))
        tk.Label(root, text="קריאה בלבד — לא סוחר. השאר פתוח בזמן המסחר.",
                 font=("Segoe UI", 9), fg="#939fc0", bg="#0b1020").pack()

        self.status = tk.Label(root, text="⏳ מתחבר ל-MT5...", font=("Segoe UI", 12, "bold"),
                               fg="#f5a524", bg="#141a2e", pady=10)
        self.status.pack(fill="x", padx=14, pady=12)

        tk.Label(root, text="הפוזיציות הפתוחות שלך:", font=("Segoe UI", 10, "bold"),
                 fg="#e7ecf6", bg="#0b1020", anchor="e").pack(fill="x", padx=16)
        self.positions = tk.Text(root, height=7, bg="#141a2e", fg="#e7ecf6",
                                 font=("Consolas", 10), relief="flat", state="disabled")
        self.positions.pack(fill="x", padx=14, pady=(2, 8))

        tk.Label(root, text="התראות:", font=("Segoe UI", 10, "bold"),
                 fg="#e7ecf6", bg="#0b1020", anchor="e").pack(fill="x", padx=16)
        self.log = tk.Text(root, height=8, bg="#141a2e", fg="#f5a524",
                           font=("Segoe UI", 10), relief="flat", state="disabled")
        self.log.pack(fill="both", expand=True, padx=14, pady=(2, 8))

        ttk.Button(root, text="צור קיצור דרך בשולחן העבודה",
                   command=self._make_shortcut).pack(pady=(0, 12))

        self.connected = False
        self.root.after(500, self.poll)

    def _set_status(self, text, color):
        self.status.config(text=text, fg=color)

    def _set_positions(self, lines):
        self.positions.config(state="normal")
        self.positions.delete("1.0", "end")
        self.positions.insert("end", "\n".join(lines) if lines else
                              "אין פוזיציות פתוחות כרגע — שומר עליך. פתח עסקה ותראה אותי עובד.")
        self.positions.config(state="disabled")

    def _log_alert(self, msg):
        self.log.config(state="normal")
        self.log.insert("1.0", f"[{datetime.now():%H:%M:%S}] {msg}\n")
        self.log.config(state="disabled")

    def _fire(self, type_, symbol, ref, msg):
        self._log_alert(msg)
        _toast("מנטור — שים לב", msg)
        _post_backend(self.cfg, type_, symbol, ref, msg)

    def _make_shortcut(self):
        try:
            target = sys.executable
            desktop = os.path.join(os.environ["USERPROFILE"], "Desktop", "MentorGuard.lnk")
            ps = (f"$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{desktop}');"
                  f"$s.TargetPath='{target}';$s.Save()")
            subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                           creationflags=0x08000000)
            self._log_alert("נוצר קיצור דרך בשולחן העבודה ✓")
        except Exception as exc:
            self._log_alert(f"לא הצלחתי ליצור קיצור דרך: {exc}")

    def poll(self):
        try:
            self._tick()
        except Exception as exc:
            self._set_status(f"שגיאה: {exc}", "#f04b5e")
        self.root.after(POLL_MS, self.poll)

    def _tick(self):
        if mt5 is None:
            self._set_status("MetaTrader5 לא זמין במכונה הזו", "#f04b5e")
            return
        if not mt5.initialize():
            self.connected = False
            self._set_status("⏳ ממתין ל-MT5 — ודא שהטרמינל פתוח ומחובר", "#f5a524")
            return

        ai = mt5.account_info()
        if ai:
            self._set_status(f"✅ שומר עליך | חשבון {ai.login} | {ai.server} | "
                             f"יתרה {ai.balance:,.0f} {ai.currency}", "#2ecc8f")

        # revenge detection
        deals = mt5.history_deals_get(datetime.now() - timedelta(hours=12), datetime.now())
        for d in (deals or []):
            if d.ticket in self.seen_deals:
                continue
            self.seen_deals.add(d.ticket)
            if d.entry == mt5.DEAL_ENTRY_OUT and d.profit < 0:
                self.last_loss_close = datetime.now()
            elif d.entry == mt5.DEAL_ENTRY_IN and self.last_loss_close:
                gap = (datetime.now() - self.last_loss_close).total_seconds() / 60
                if gap <= self.revenge_min:
                    self._fire("revenge_trade", d.symbol, d.position_id,
                               f"פתחת {d.symbol} רק {int(gap)} דק' אחרי הפסד — מסחר נקמה. קח הפסקה.")

        # open positions: heartbeat + checks
        positions = mt5.positions_get() or []
        lines = []
        for p in positions:
            mark = "סטופ ✓" if p.sl else "אין סטופ ✗"
            lines.append(f"{p.symbol:<10} {p.volume:>5} לוט   {mark}")
            grace_passed = (datetime.now().timestamp() - p.time) >= self.grace
            if p.sl == 0.0 and grace_passed and p.ticket not in self.warned_nostop:
                self._fire("no_stop_loss", p.symbol, p.ticket,
                           f"פתחת {p.symbol} בלי stop-loss. שים סטופ עכשיו — "
                           f"הפסד אחד בלי סטופ מוחק כמה רווחים.")
                self.warned_nostop.add(p.ticket)
            elif p.sl != 0.0 and p.ticket not in self.warned_oversized and ai:
                risk = _risk_money(p.symbol, p.price_open, p.sl, p.volume)
                if ai.balance > 0 and risk > ai.balance * self.max_risk / 100:
                    self._fire("oversized", p.symbol, p.ticket,
                               f"הסיכון ב-{p.symbol} כ-${risk:,.0f} — מעל {self.max_risk:.0f}% "
                               f"מההון. הקטן פוזיציה או קרב את הסטופ.")
                    self.warned_oversized.add(p.ticket)
        self._set_positions(lines)


def main():
    root = tk.Tk()
    GuardApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
