# המשך מכאן — Mentor Trade (עודכן 2026-06-18)

מסמך מעבר לשיחה הבאה. **קרא אותי קודם, מההתחלה עד הסוף.**

## מה זה
**מנטור (Mentor Trade)** — מאמן מסחר התנהגותי לסוחרי MT5 (וקריפטו) מתחילים.
**קריאה בלבד, חינוכי בלבד, לא סוחר, בלי הבטחות רווח.** מודל מנוי חודשי (₪79).

## 🟢 מצב חי נכון לעכשיו — הכל עובד ואומת
- **שרת חי על Render:** `https://mentor-trade.onrender.com` (דף נחיתה ב-`/`, אפליקציה ב-`/app`).
- **PostgreSQL קבוע** (שירות `mentor-db` ב-Render) — חשבונות נשמרים, לא נמחקים יותר ב-restart.
- **Auto-Deploy דלוק** — כל push ל-`main` נפרס לבד. **אין יותר Manual Deploy.**
- **58 בדיקות pytest עוברות.**

## 🏗 הארכיטקטורה (איך זה עובד) — חשוב
הזרימה: **EA בתוך MT5 → שולח כל פתיחה/סגירה/שינוי-SL דרך WebRequest → `/api/mt5/webhook` → מנוע כללים → התראות + עסקאות נשמרות ב-Postgres → מופיע בדאשבורד באתר ובטלגרם.**

- **זרקנו את גישת ה-.exe Watcher (Python)** — לפי ביקורת נכונה של ג'ימיני (אנטי-וירוס/uptime/בלבול-טרמינלים). המסלול עכשיו הוא **EA טהור ב-MQL5**.
- **מנוע הכללים DB-backed** (לא in-memory) — יציב אחרי restart. revenge נקרא מטבלת `round_trips`, averaging מטבלת `open_positions`.
- **סינכרוני, לא async** — האפליקציה כולה sync SQLAlchemy. FastAPI מריץ `def` ב-threadpool (אין latency). **לא להמיר ל-async** (היה שובר הכל; ג'ימיני הסכים שטעה בדרישה הזו).

## 🤖 מנוע ה-10 חוקים (ב-`app/main.py`, endpoint `/api/mt5/webhook`)
3 מקוריים: `No_Stop_Loss`, `Revenge_Trade`, `Averaging_Down`.
7 חדשים: `Risk_Overload`, `Overtrading_Bleed`, `Inverted_Time_Hold`, `Stop_Loss_Dragging`, `Negative_Risk_Reward`, `Margin_Danger`, `Weekend_Gap_Risk`.
כולם אומתו חי. 3 מהם (Risk_Overload, Margin_Danger, Stop_Loss_Dragging) דורשים את ה-EA החדש ששולח free_margin/notional/modify.

## 📥 הורדה והתקנה (self-service באתר)
- **הורדת EA:** `/api/download/watcher-ea` (octet-stream+attachment). כפתור "⬇️ הורד את שומר המסחר (EA)" במסך החיבור.
- **מתקין אוטומטי:** `/api/download/installer` — קובץ .bat שמוריד את ה-EA ומעתיק אותו לבד לכל טרמינלי ה-MT5 (Experts). כפתור "🔧 הורד מתקין אוטומטי".
- זרימת לקוח: מוריד EA (או מריץ מתקין) → גורר לגרף ב-MT5 → מדביק טוקן ב-Inputs → מסמן Allow WebRequest → נתונים זורמים לאתר.
- **כניסה בלחיצה אחת:** `/app?token=XXX` נכנס ישר לחשבון (magic link, פרוס).

## איפה הקוד
- GitHub: **052adir/quivr**. ענף ראשי **main** (Auto-Deploy דלוק). ענף עבודה: `claude/trading-assistant-concept-ts64il`. `render.yaml` + `.gitattributes` ב-root.
- מקומי: `C:\Users\User\Desktop\quivr\trading-assistant`
- דחיפה ל-main דורשת אישור מפורש של אדיר ("תדחוף") — המערכת חוסמת אחרת.

## קבצים מרכזיים
- `backend/app/main.py` — כולל `/api/mt5/webhook` (מנוע 10 חוקים) + endpoints הורדה.
- `backend/app/models.py` — כולל `OpenPosition` (פוזיציות פתוחות לזיהוי averaging/SL-drag).
- `backend/app/database.py` — `_ensure_added_columns()` מוסיף עמודות חדשות ב-SQLite+Postgres (create_all לא משנה טבלאות קיימות — שים לב לזה!).
- `backend/app/schemas.py` — `WebhookEventIn` (כולל free_margin, notional).
- `mt5-ea/MentorTrade_Watcher.mq5` (+ .ex5 מקומפל) — ה-EA. גם מועתק ל-`frontend/` כדי שיוגש להורדה.
- `frontend/index.html` + `app.js` — מסך החיבור עם כפתורי ההורדה + תצוגת טוקן.

## ⚙️ Render
- שירות web `mentor-trade` (Oregon, free) + מסד `mentor-db` (PostgreSQL, free). שניהם תחת ה-Blueprint "mentor".
- לקמפל EA מחדש: `& "C:\Program Files\MetaTrader 5\metaeditor64.exe" "/compile:<path.mq5>" "/log"` → 0 שגיאות, ואז להעתיק את ה-.ex5 ל-`frontend/`.

## החלטות שאסור לשבור
1. **חינוכי בלבד / קריאה בלבד / לא סוחר / בלי הבטחות רווח.**
2. **MT5 רק דרך EA** (לא server-side login — חוטף את הטרמינל).
3. **MetaApi (ענן web-only ל-MT5) = Phase 2** — עולה כסף, כשיהיו לקוחות משלמים. אז מתמחרים עלות-טעונה.
4. **קריפטו (Binance/ccxt) = web-only חינם** — לאדיר אין חשבון קריפטו כרגע.
5. חשבון **52874606** (ICMarketsSC-Demo) = חשבון של אדיר, אבל **שיחת Claude אחרת מריצה עליו בוטי mean-reversion (Python)**. קו אדום — לא לפעול עליו בלי אישור מפורש (ראה `bot_inventory.md`).
6. **לא async** ל-DB (ראה ארכיטקטורה למעלה).

## 🧭 איך לעבוד (לפי `C:\Users\User\.claude\CLAUDE.md` הגלובלי)
לחשוב לעומק לפני פעולה; **לא לזרום עם בקשה שגויה — להתעמת בכבוד**; לבדוק לעומק (לא להגיד "עובד" בלי אימות); ישרות על טעויות; פשטות; לא לחגוג מוקדם. **רק להוסיף קוד, לא למחוק קיים** בלי אישור.
**אדיר עובד במקביל עם ג'ימיני** כמבקר — הוא מדביק את ביקורות ג'ימיני, ואתה מיישם / מתעמת לפי הצורך. זה תהליך בריא; להמשיך אותו.

## הצעד הבא
1. אדיר עומד **לבדוק את ההורדה+המתקין** (Ctrl+F5 → הורדה → התקנה ב-MT5).
2. **Crash Test של ג'ימיני:** להתקין את ה-EA על דמו ולבצע בכוונה את 10 ההפרות, ולוודא שכל דגל מופיע בדאשבורד. (חוקים תלויי-צבירה — Overtrading/Negative_RR/Inverted — דורשים נפח/היסטוריה, לא יורים בעסקה אחת.)
3. בהמשך: הזרקת טוקן אוטומטית להורדה, עוד חוקים, MetaApi (Phase 2), חיתום קוד למתקין (להסיר אזהרת SmartScreen).

## ערכים שימושיים
- כתובת חיה: `https://mentor-trade.onrender.com`
- חשבון בדיקה עם נתונים אמיתיים (מ-52874606): `mt5-live-demo@example.com` / `Live-987654!` (אם שרד ב-Postgres).
- בוט טלגרם: @MentorGuardBot (טוקן ב-`backend/.env` מקומי + ב-Render env). ⚠️ נחשף בצ'אט קודם — לחדש לפני השקה.

## פקודות
```
cd C:\Users\User\Desktop\quivr\trading-assistant\backend
.\.venv\Scripts\python.exe -m pytest                              # 58 בדיקות
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000    # הרצה מקומית
```
