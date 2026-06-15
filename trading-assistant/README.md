# מנטור (Mentor Trade) — מאמן מסחר אישי לסוחרים מתחילים

עוזר חכם שמתחבר לחשבון המסחר של הסוחר **בקריאה בלבד**, צופה בכל עסקה,
ומאמן אותו בזמן אמת: מזהה את הטעויות החוזרות שלו, מחזק הצלחות, מנהל לו יומן
מסחר אוטומטי, ומלמד אותו דרך מורה־AI. **חינוכי בלבד — בלי איתותי קנייה/מכירה
ובלי ייעוץ השקעות.**

זהו MVP עובד מקצה לקצה (לא מוצר פרודקשן בקנה מידה מלא), שנבנה כבסיס להמשך פיתוח.

---

## מה יש כאן

| רכיב | תיאור |
|------|--------|
| **חיבור בקריאה־בלבד** | מפתח API של Binance (read-only) — או מצב **DEMO** עם נתונים מציאותיים |
| **יומן אוטומטי** | כל עסקה סגורה נרשמת לבד (התאמת FIFO של קניות/מכירות → round-trips) |
| **מנוע זיהוי דפוסים** | מסחר נקמה, פוזיציות גדולות מדי, מסחר בלי stop-loss, מסחר יתר, החזקת מפסידות, ורצפי ניצחון |
| **התראות בזמן אמת** | בתוך האפליקציה + דחיפה לטלגרם (אופציונלי) — רץ ברקע בלי מסך פתוח |
| **סקירה שבועית** | סיכום ביצועים + החולשה הבולטת של השבוע |
| **מורה־AI** | צ'אט חינוכי מבוסס Claude, מותאם לנתונים האישיים של הסוחר |
| **מסלול למידה** | שיעורים מדורגים: ניהול סיכון, stop-loss, פסיכולוגיה, גודל פוזיציה |

---

## איך מריצים

```bash
cd trading-assistant
./run.sh
```

ואז נכנסים ל־<http://localhost:8000>, נרשמים, ובמסך **חיבור והגדרות** מזינים
`DEMO` בשדה ה-API key כדי לטעון מיד נתוני דמו ולראות את כל המערכת עובדת.

> הרצה ידנית:
> ```bash
> cd trading-assistant/backend
> python3 -m venv .venv && source .venv/bin/activate
> pip install -r requirements.txt
> cp .env.example .env      # אופציונלי: הוסף ANTHROPIC_API_KEY / TELEGRAM_BOT_TOKEN
> uvicorn app.main:app --reload
> ```

---

## הגדרות (`backend/.env`)

| משתנה | למה זה |
|-------|--------|
| `ANTHROPIC_API_KEY` | מפעיל את המורה־AI (בלי זה — תשובות מתוך מאגר שיעורים) |
| `MENTOR_CHAT_MODEL` | מודל הצ'אט (ברירת מחדל `claude-sonnet-4-6`; אפשר `claude-opus-4-8`) |
| `TELEGRAM_BOT_TOKEN` | מפעיל דחיפת התראות לטלגרם |
| `SYNC_INTERVAL_SECONDS` | כל כמה זמן הרקע מסנכרן עסקאות (ברירת מחדל 60) |

---

## ארכיטקטורה

```
exchange fills ──► Trade rows ──► RoundTrip rows ──► Alerts ──► Telegram
   (Binance/DEMO)    (יומן)        (FIFO matching)   (מנוע דפוסים)   (push)
                                         │
                                         └──► Claude tutor (שאלות + הקשר אישי)
```

- `app/binance_client.py` — לקוח REST בקריאה־בלבד (חתימת HMAC, בלי SDK)
- `app/analysis.py` — בניית round-trips וחישוב סטטיסטיקות
- `app/patterns.py` — מנוע האימון (כללי זיהוי דפוסים, הודעות בעברית)
- `app/sync_service.py` — הצינור המלא, רץ ברקע על טיימר
- `app/education.py` — המורה־AI (Claude) + מסלול השיעורים

## מקצועיות / Production-readiness

המערכת עברה הקשחה לרמת SaaS:

| תחום | מה נעשה |
|------|---------|
| **אבטחה** | מפתחות הבורסה מוצפנים ב-DB (Fernet, `app/crypto.py`); כותרות אבטחה (nosniff/frame-options/HSTS); rate-limiting על הרשמה/התחברות/לידים; סיסמאות עם PBKDF2 |
| **מנויים** | מודל ניסיון 7 ימים + paywall (`require_access`); אינטגרציית Stripe Checkout + Webhook (`app/billing.py`); מצב "trial-only" כשאין מפתחות |
| **תצפיתיות** | לוגים מובנים עם request-id וזמני תגובה; `GET /healthz` (בדיקת DB) ו-`GET /version` |
| **איכות** | חבילת בדיקות `pytest` (27 בדיקות: ניתוח FIFO, מנוע דפוסים, הצפנה, paywall, API מקצה-לקצה) |
| **פריסה** | `Dockerfile` + `docker-compose.yml` עם volume לנתונים ו-HEALTHCHECK |

### הרצת בדיקות

```bash
cd trading-assistant/backend && source .venv/bin/activate
python -m pytest        # 27 passed
```

### פריסה עם Docker

```bash
cd trading-assistant
export MENTOR_SECRET_KEY=$(python3 -c "import secrets;print(secrets.token_hex(32))")
docker compose up --build      # http://localhost:8000
```

### חיבור Stripe (גבייה אמיתית, מקצה לקצה)

1. הגדר ב-`.env`: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (מנוי חוזר ₪79/חודש), `STRIPE_WEBHOOK_SECRET`.
2. המשתמש לוחץ "שדרג" → `POST /api/billing/checkout` יוצר Checkout Session ומפנה ל-Stripe.
3. אחרי תשלום חוזרים ל-`/app?billing=success` (טוסט הצלחה + רענון סטטוס).
4. Stripe שולח Webhook ל-`/api/billing/webhook` → המנוי מסומן `active` (ובחיובים שנכשלו `past_due`, בביטול `canceled`).

לבדיקה מקומית: `stripe listen --forward-to localhost:8000/api/billing/webhook`.
ללא מפתחות — המערכת רצה ב"מצב ניסיון בלבד" וכל מסך החיוב מתנהג בהתאם.

### בוט טלגרם (לכידת לידים + התראות אוטומטיות)

1. צור בוט עם **@BotFather**, והגדר ב-`.env`: `TELEGRAM_BOT_TOKEN` ו-`TELEGRAM_BOT_USERNAME`.
2. השרת מפעיל אוטומטית worker שמאזין לבוט (long-polling) כשהטוקן מוגדר.
3. **לכידת לידים:** כל מי שפותח את הבוט (`/start`) נשמר כליד, כולל קוד אפיליאייט מה-deep-link (`?start=REF`).
4. **חיבור חשבון:** במסך "חיבור והגדרות" → "חבר טלגרם" → המשתמש שולח לבוט `/link CODE` (או לוחץ על ה-deep-link), והצ'אט שלו נקשר לחשבון.
5. מאותו רגע כל התראה (revenge trade, בלי stop וכו') נדחפת אליו אוטומטית בטלגרם.

## הערות אבטחה

- מפתחות API חייבים להיות **read-only**. המערכת לעולם לא שולחת פקודות מסחר.
- מפתחות הבורסה **מוצפנים** ב-DB. בפרודקשן הגדר `MENTOR_SECRET_KEY` חזק ושמור אותו מחוץ לקוד (Secrets Manager), והוסף HTTPS (reverse proxy).
- שלב הבא מומלץ: מעבר ל-PostgreSQL + מיגרציות (Alembic) לסכימה מתפתחת.
