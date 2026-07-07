# מערכת ניהול פרגו

מערכת ניהול לפיצה פרגו – צור הדסה. אפליקציית ווב פשוטה, מהירה ונוחה לשימוש יומיומי,
Mobile-first, עברית מלאה עם RTL.

## סטאק

- **Next.js 15** (App Router) + **TypeScript** + **React 19**
- **Tailwind CSS v4** — עיצוב נקי, Mobile-first, RTL מלא
- **Supabase** (Postgres) — מסד נתונים ו-Auth לעתיד
- **Recharts** — גרפים · **SheetJS** — ייצוא Excel · **lucide-react** — אייקונים

## מסכים (שלב 1 — בנוי ועובד)

| מסך | תיאור |
|------|--------|
| **דשבורד** | תמונת מצב ב-30 שניות: שעוני מחוונים, נורות התרעה, אירוע קרוב, משימות |
| **יומן יומי** | מקור האמת — הזנה יומית בפחות מ-2 דקות, כל שדה מחושב אוטומטית |
| **תזרים והפקדות** | יתרות, מזומן להפקדה, התאמת אמצעי תשלום, התראות |
| **לוח שנה עסקי** | חגים ותקופות עם משימה מומלצת ואחראי |
| **משימות** | מתוכנן/בתהליך/בוצע/תקוע לפי תחום ואחראי |
| **לקוחות פוטנציאליים** | משפך טעימות: אותר → טעימה → מעקב → הזמנה → קבוע |
| **תפריט ומנות** | בקרת רווחיות ופוד קוסט לכל מנה |
| **דוחות** | גרפים (מתעלמים מימים ריקים) + ייצוא Excel |

### מודולים עתידיים (הארכיטקטורה מוכנה)
עובדים וסידור שבועי (בנוי), דוח Z יומי במייל (בנוי, שליחה ידנית), פוד קוסט ו-AI (מסכי placeholder + טבלאות).

## עקרונות מרכזיים

- **כל נתון מוזן פעם אחת** — שדות מחושבים (`avg_order`, `total_payments`, `revenue_difference`,
  `cash_to_deposit`, `food_cost_percent`, `gross_profit`) הם `GENERATED COLUMNS` ב-Postgres.
- **גרפים מתעלמים מימים ריקים** — ימים ללא מחזור לא נספרים.
- **מודולריות** — כל אינטגרציה עתידית (קופת אביב, בנק, WhatsApp, דיוור) נכנסת דרך
  `src/lib/integrations/registry.ts` בלי לשנות את מסכי הליבה.

## הפעלה

### 1. חיבור Supabase (5 דקות)
1. פתחו פרויקט חינמי ב-[supabase.com](https://supabase.com).
2. ב-**SQL Editor** הריצו את `supabase/migrations/0001_init.sql` ואז את `supabase/seed.sql`.
3. העתיקו `.env.local.example` ל-`.env.local` ומלאו מ-**Project Settings → API**:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

### 2. הרצה
```bash
npm install
npm run dev      # http://localhost:3000
```

## מבנה

```
src/
  app/                 # מסכים (דשבורד, יומן, תזרים, ...)
  components/          # AppShell, Gauge, ui, Modal, JournalForm
  lib/
    domain/calc.ts     # כל הלוגיקה העסקית (טהורה, נבדקת) — מקור החישובים
    domain/types.ts    # טיפוסים = סכמת ה-DB
    repo.ts            # שכבת גישה לנתונים (הסמן לאינטגרציות עתידיות)
    integrations/      # רישום מודולים עתידי
    supabase/          # client + config
  config/nav.ts        # ניווט
supabase/
  migrations/0001_init.sql   # סכמה מלאה + RLS + generated columns
  seed.sql                   # לוח שנה (549 יום), יומן, משימות, מנות
```

## הערת אבטחה (שלב 1)
מדיניות ה-RLS הנוכחית מתירה גישה מלאה (single-workspace) כדי לא להתעכב על הרשאות.
לפני חשיפה ציבורית — להוסיף התחברות (Supabase Auth) ולהצר את המדיניות לפי תפקידים
(מנהל / שותפה / עובד / רואה חשבון). המבנה מוכן לכך.
