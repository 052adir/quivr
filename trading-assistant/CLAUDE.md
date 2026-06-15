# Mentor Trade — מדריך פרויקט ל-Claude Code

> מאמן מסחר אישי (AI) לסוחרים מתחילים. **חינוכי בלבד** — בלי איתותים, בלי ייעוץ,
> בלי הבטחות רווח. מתחבר לחשבון מסחר **בקריאה בלבד**, מתעד כל עסקה, ומאמן על
> דפוסי טעות/הצלחה בזמן אמת.

קובץ זה הוא ההקשר להמשך עבודה עם Claude Code בטרמינל. הרץ `claude` מתוך תיקיית
`trading-assistant/`.

## סטטוס נוכחי: v0.2.0 (MVP מוקשח, רץ ועובר בדיקות)

עובד ונבדק מקצה לקצה (44 בדיקות `pytest` עוברות):
- **רב-פלטפורמי** (`app/connectors.py`): demo · Binance · **ccxt** (100+ בורסות קריפטו) · **MT5** (מט"ח/CFD/מניות, סיסמת משקיע read-only). הוספת פלטפורמה = פונקציה אחת ב-registry
- חיבור Binance read-only (HMAC, בלי SDK) + מצב **DEMO** עם נתונים מציאותיים
- התאמת FIFO של עסקאות → round-trips + סטטיסטיקות
- מנוע דפוסים: מסחר נקמה, פוזיציה גדולה מדי, בלי stop-loss, מסחר יתר, החזקת מפסידות, רצף ניצחון
- התראות באפליקציה + דחיפה לטלגרם; סנכרון רקע על טיימר
- סקירה שבועית; מורה־AI (Claude) עם נפילה חיננית למאגר שיעורים
- אבטחה: הצפנת מפתחות (Fernet), כותרות אבטחה, rate-limiting, hashing סיסמאות (PBKDF2)
- מנויים: ניסיון 7 ימים + paywall + Stripe Checkout/Webhook (מצב trial-only בלי מפתחות)
- בוט טלגרם: לכידת לידים (+אפיליאייט) וחיבור חשבון אוטומטי
- שיווק: דף נחיתה ממיר (`/`), לכידת לידים, מעקב `?ref=`
- תצפיתיות: לוגים מובנים, `/healthz`, `/version`; Docker + compose

## מבנה

```
trading-assistant/
  backend/
    app/
      main.py           # FastAPI: routes, middleware, lifespan, paywall gate
      config.py         # הגדרות מ-env
      database.py       # SQLAlchemy engine/session
      models.py         # User, Connection, Trade, RoundTrip, Alert, ChatMessage, Lead
      connectors.py     # שכבת מחברים רב-פלטפורמית (demo/binance/ccxt/mt5) + registry
      binance_client.py # לקוח REST read-only (HMAC)
      mock_data.py      # פיד DEMO סינתטי
      analysis.py       # בניית round-trips (FIFO) + summarize
      patterns.py       # מנוע הדפוסים (הודעות בעברית)
      sync_service.py   # הצינור: fills→trades→round-trips→alerts→telegram
      education.py      # מורה־AI (Claude) + מסלול שיעורים
      access.py         # לוגיקת ניסיון/מנוי (paywall)
      billing.py        # Stripe checkout + webhook
      crypto.py         # הצפנת מפתחות (Fernet)
      ratelimit.py      # rate limiter בזיכרון
      security.py       # סיסמאות + טוקנים
      telegram.py       # send/getUpdates
      telegram_bot.py   # worker: lead capture + linking
    tests/              # pytest (36 בדיקות)
    requirements.txt, Dockerfile, pytest.ini, .env.example
  frontend/             # אפליקציה (HTML+vanilla JS+Chart.js) — מוגשת ב-/app
  landing/              # דף נחיתה שיווקי — מוגש ב-/
  marketing/            # ערכת שיווק (קופי לטלגרם/וואטסאפ, אפיליאייט, תוכנית השקה)
  docker-compose.yml, run.sh, README.md
```

## פקודות

```bash
# הרצה מקומית (יוצר venv, מתקין, מריץ על :8000)
./run.sh

# או ידנית:
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# בדיקות
cd backend && source .venv/bin/activate && python -m pytest   # 36 passed

# Docker
export MENTOR_SECRET_KEY=$(python3 -c "import secrets;print(secrets.token_hex(32))")
docker compose up --build
```

כניסה: `http://localhost:8000` (נחיתה) · `http://localhost:8000/app` (מוצר).
להדגמה מהירה: הירשם → "חיבור והגדרות" → הזן `DEMO` בשדה המפתח.

## משתני סביבה (`backend/.env`, ראה `.env.example`)

`MENTOR_SECRET_KEY` (חובה בפרודקשן, להצפנה) · `ANTHROPIC_API_KEY` + `MENTOR_CHAT_MODEL`
(ברירת מחדל `claude-sonnet-4-6`) · `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_USERNAME` ·
`STRIPE_SECRET_KEY` + `STRIPE_PRICE_ID` + `STRIPE_WEBHOOK_SECRET` · `APP_BASE_URL` ·
`DATABASE_URL` · `TRIAL_DAYS` · `SYNC_INTERVAL_SECONDS`.

## עקרונות שאסור לשבור (Guardrails)

1. **חינוכי בלבד** — אסור איתותי קנייה/מכירה או ייעוץ. אסור להבטיח רווח/תשואה.
2. **קריאה בלבד** — לעולם לא לשלוח פקודות מסחר לבורסה.
3. מפתחות בורסה **תמיד מוצפנים** ב-DB.
4. הודעות למשתמש בעברית; קוד והערות באנגלית, בסגנון הקיים.
5. כל פיצ'ר חדש — להוסיף בדיקות ולוודא ש-`pytest` ירוק.

## משימות פתוחות מומלצות (Roadmap)

- [ ] חיבור Stripe אמיתי מקצה לקצה (Price ID של ₪79) + בדיקת webhook עם `stripe listen`
- [x] הרחבה למט"ח/מניות + רב-פלטפורמי (ccxt + MT5) — בוצע ב-v0.3
- [ ] בדיקת MT5 חיה מול חשבון אמיתי (טרמינל פתוח + סיסמת משקיע) — **לא 52874606**
- [ ] לוח אדמין: לידים, המרות, מעקב שותפים/אפיליאייט
- [ ] WebSocket לזיהוי עסקאות מהיר יותר (במקום polling)
- [ ] מעבר ל-PostgreSQL + מיגרציות (Alembic)
- [ ] HTTPS/reverse proxy + ניהול סודות (Secrets Manager) לפרודקשן

## הערה על מודל ה-AI

המורה־AI משתמש ב-Anthropic Python SDK (`anthropic`), מודל לפי `MENTOR_CHAT_MODEL`
(ברירת מחדל `claude-sonnet-4-6`; אפשר `claude-opus-4-8`). הקוד ב-`app/education.py`.
