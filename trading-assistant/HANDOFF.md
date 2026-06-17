# המשך מכאן — Mentor Trade (עודכן 2026-06-17)

מסמך מעבר לשיחה הבאה. קרא אותי קודם.

## מה זה
**מנטור (Mentor Trade)** — מאמן מסחר התנהגותי לסוחרי MT5 (וקריפטו) מתחילים.
**קריאה בלבד, חינוכי בלבד, לא סוחר, בלי הבטחות רווח.** מתריע על הטעויות שעולות
כסף: בלי stop-loss, סיכון גבוה מדי, מסחר נקמה — עם הסכומים האמיתיים של הסוחר.

## איפה הקוד
- GitHub: **052adir/quivr** (public fork). הכל ב-**main** וגם בענף `claude/trading-assistant-concept-ts64il`. `render.yaml` ב-root.
- מקומי: `C:\Users\User\Desktop\quivr\trading-assistant`
- 58 בדיקות pytest עוברות.

## מצב נוכחי (2026-06-17)
1. **פריסה ל-Render בעיצומה.** המשתמש במסך "Deploy Blueprint" (ענף main, שירות `mentor-trade`). **צעד מיידי: ללחוץ Deploy Blueprint → להמתין ~5 דק' → לקבל כתובת `https://mentor-trade.onrender.com`** (משרת דף נחיתה + אפליקציה + API).
2. **דף נחיתה סטטי חי** ב-Cloudflare Pages: `https://mentor-landing.052adir.workers.dev` — אבל הכפתור /app שם 404 (אין שם שרת). אחרי Render, להשתמש בכתובת onrender לכל, או להפנות את ה-CTA של Cloudflare ל-onrender.
3. **טלגרם:** בוט **@MentorGuardBot** (טוקן ב-`backend/.env` מקומי). חובר ונבדק חי — התראות מגיעות. ⚠️ הטוקן נחשף בצ'אט → לבטל ולחדש ב-BotFather לפני השקה אמיתית.
4. **EA** (`mt5-ea/MentorGuard.ex5`) הותקן ב-11 הטרמינלים של המשתמש; מצייר פאנל חי + אזהרות אדומות, ושולח היסטוריה ל-`/api/mt5/trades`.

## הצעד הבא המיידי
1. לאשר שה-Render deploy הצליח → לקבל את הכתובת החיה. אם נכשל — לבדוק לוג בנייה ב-Render.
2. ב-Render → השירות → Environment, להוסיף: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `APP_BASE_URL`=הכתובת onrender, ואופציונלי `ANTHROPIC_API_KEY`.
3. לבדוק שהכתובת onrender עובדת: דף נחיתה ב-/, אפליקציה ב-/app, הרשמה+דמו.
4. מגבלות חינם של Render: נרדם אחרי 15 דק' (cold start ~30-60ש); SQLite מתאפס בפריסה מחדש (אין דיסק קבוע) — בהמשך Postgres חינמי לעמידות.

## החלטות שאסור לשבור
1. **חינוכי בלבד / קריאה בלבד / לא סוחר / בלי הבטחות רווח.**
2. **אסור לחבר MT5 מצד-השרת** — `mt5.login()` חוטף את הטרמינל למצב משקיע וחוסם מסחר. MT5 מטופל **רק דרך ה-EA** (קורא, לא משנה התחברות). זה הוסר מ-connectors.
3. **MetaApi/ענד נדחה ל-Phase 2** (עולה כסף + כרטיס אשראי; המשתמש מתחיל בלי תקציב). Phase 1 = EA חינמי לסוחרי מחשב.
4. ההתראות **מייעצות, לא חוסמות** — הסוחר שומר שליטה מלאה (החלטה מפורשת של המשתמש).
5. חשבון **52874606** (ICMarketsSC-Demo) = חשבון הדמו של המשתמש. כלל זיכרון אומר "לא לפעול עליו"; המשתמש אישר קריאה-בלבד הפעם. מערכת ההרשאות חוסמת התחברות ישירה מהכלים — ה-EA (שהמשתמש מתקין) מטפל בזה.

## ערכים שימושיים
- טוקן Mentor של המשתמש (לאפליקציה/EA): `de8e3e7be3b07b1d579bad1d83874246db09f3e961eae3c3` (052adir@gmail.com)
- בוט: @MentorGuardBot
- Cloudflare landing: https://mentor-landing.052adir.workers.dev

## פקודות מקומיות
```
cd C:\Users\User\Desktop\quivr\trading-assistant\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000   # הרצה
.\.venv\Scripts\python.exe -m pytest                              # בדיקות (58)
```

## מבנה (פירוט מלא ב-CLAUDE.md)
backend/app: main, connectors, diagnosis, patterns, sync_service, telegram_bot,
education, billing, access, crypto, security · frontend (אפליקציה) · landing
(דף נחיתה) · mt5-ea (EA) · marketing (ערכת שיווק).
