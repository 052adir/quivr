# MentorGuard — EA חי ל-MT5 (מאמן בזמן אמת)

Expert Advisor ל-MetaTrader 5 שיושב בטרמינל שלך, צופה בעסקאות שלך **בזמן אמת**,
ומתריע ברגע שאתה עושה טעות — **בלי לסחור בשבילך**. קריאה בלבד.

## על מה הוא מתריע
- 🛑 **פתחת בלי stop-loss** — תוך שניות מרגע פתיחת הפוזיציה (אחרי תקופת חסד קצרה).
- ⚠️ **סיכון גדול מדי** — אם הסיכון בעסקה (לפי מרחק הסטופ) עובר אחוז שתגדיר מההון.
- 🔁 **מסחר נקמה** — עסקה חדשה זמן קצר אחרי הפסד.

## איך זה מתריע (ערוצים — אתה בוחר)
- **פופ-אפ + צליל בטרמינל** (`InpPopup`)
- **פוש לאפליקציית MetaTrader בנייד** (`InpMobile`) — דורש הגדרת MetaQuotes ID ב-Options → Notifications
- **Webhook לאפליקציית Mentor** (`InpBackendUrl` + `InpToken`) — משם זה ממשיך אוטומטית לטלגרם ולפיד באפליקציה

## התקנה
1. ב-MT5: **File → Open Data Folder** → `MQL5\Experts\`. העתק לשם את `MentorGuard.mq5`.
2. פתח **MetaEditor** (F4), פתח את הקובץ, ולחץ **Compile** (F7).
3. ב-MT5, גרור את **MentorGuard** מ-Navigator על גרף כלשהו של החשבון שתרצה לנטר.
4. בלשונית **Common**: סמן *Allow Algo Trading* (ה-EA לא סוחר — זה רק כדי שירוץ).
5. ב-**Inputs** הגדר העדפות (ראה למטה).

## חיבור לאפליקציה (אופציונלי, מומלץ)
כדי שההתראות יגיעו גם לטלגרם ולדשבורד:
1. ב-Mentor → **חיבור והגדרות** → קח את הטוקן שלך (או חבר טלגרם).
2. ב-Inputs של ה-EA:
   - `InpBackendUrl` = `http://localhost:8000/api/ea/event` (או הדומיין שלך)
   - `InpToken` = הטוקן שלך מ-Mentor
3. אשר WebRequest: **Tools → Options → Expert Advisors → Allow WebRequest for listed URL** → הוסף את ה-URL.

## פרמטרים (Inputs)
| פרמטר | ברירת מחדל | מה זה |
|-------|-----------|--------|
| `InpMaxRiskPct` | 2.0 | סף "סיכון גדול מדי" — אחוז מההון לעסקה |
| `InpGraceSeconds` | 60 | כמה שניות לתת לך לשים סטופ לפני שמתריעים |
| `InpRevengeMinutes` | 30 | חלון "מסחר נקמה" אחרי הפסד |
| `InpAlertNoStop` / `InpAlertOversized` / `InpAlertRevenge` | true | אילו התראות פעילות |
| `InpPopup` / `InpMobile` | true | ערוצי התראה |

## בטיחות
ה-EA **לעולם לא** פותח, משנה או סוגר עסקאות — הוא רק קורא את הפוזיציות שלך ומתריע.
אפשר להריץ אותו על חשבון דמו או אמיתי; הוא לא נוגע בכסף.
