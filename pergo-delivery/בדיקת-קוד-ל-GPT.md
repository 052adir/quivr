# מערכת ניהול פרגו — חבילת ביקורת קוד ל-GPT

> **הנחיה למבקר (GPT):** לפניך מסמך עצמאי ומלא לביקורת. הוא כולל: (1) סיכום הפרויקט
> והחלטות אדריכליות, (2) סכמת מסד הנתונים המלאה, (3) **כל קוד המקור** של המערכת
> (Next.js + TypeScript). אין צורך בגישה חיצונית — הכל כאן.
>
> **מה אני מבקש ממך לבדוק:**
> 1. תקינות וקריאוּת הקוד; באגים לוגיים אפשריים (במיוחד `lib/domain/calc.ts`).
> 2. ארכיטקטורה — האם ההפרדה (calc / repo / localDb / integrations) נכונה לפרויקט בגודל הזה, או over-engineering?
> 3. אבטחה — מדיניות RLS הנוכחית מתירה גישה מלאה (שלב 1). מה המינימום ההכרחי לפני חשיפה ציבורית?
> 4. מודל הנתונים — נכונות ה-GENERATED COLUMNS, יחסי הטבלאות, וסיכוני חוסר עקביות.
> 5. שלמות מול האפיון — מה חסר/מומש חלקית.
> 6. סדר עדיפויות מומלץ להמשך.
>
> אנא החזר ממצאים ממוקדים עם הפניה לקובץ/שורה, וחומרה (קריטי/בינוני/שיפור).

---

## חלק 1 — סיכום הפרויקט


מסמך זה מסכם את כל מה שנבנה עבור **מערכת ניהול פרגו** (פיצה פרגו – צור הדסה),
ומיועד לביקורת חיצונית (Gemini). המטרה: לקבל ביקורת ביקורתית על הארכיטקטורה,
איכות הקוד, שלמות מול האפיון, אבטחה, והמלצות להמשך.

בסוף המסמך יש **רשימת שאלות ממוקדות למבקר**.

---

## 1. מה התבקש

לבנות מערכת ניהול פשוטה, מהירה ונוחה למסעדה קטנה-בינונית (עברית מלאה, RTL,
Mobile-first), בהשראת "לוח מכוונים" של רכב. המשתמשים: בעל העסק, שותפה, צוות.
המטרה — להבין בכל יום מה מצב העסק, מה לבצע, ואיך להגדיל מחזור ורווחיות.

**עקרון מרכזי מהאפיון:** כל נתון מוזן פעם אחת בלבד; כל שאר המסכים שואבים ממנו.

**סטאק שהתבקש:** Next.js, React, Tailwind, Supabase/Firebase, RTL, ייצוא/ייבוא Excel,
ארכיטקטורה מודולרית לאינטגרציות עתידיות (קופת אביב, בנק, WhatsApp, דיוור).

**סדר בנייה מחייב:** שלד → סכמה → Dashboard → יומן יומי, ורק אחר כך השאר.

---

## 2. מה נבנה בפועל (3 תוצרים)

| תוצר | תיאור | מיקום |
|------|--------|--------|
| **מערכת מלאה** | Next.js 15 + TS + Tailwind v4 + Supabase, 13 מסכים | `app-code/` (בריפו: `pergo-manager/`) |
| **אפליקציה עצמאית** | קובץ HTML בודד, אינטראקטיבי, נפתח בדפדפן/טלפון בלי התקנה | `מערכת-ניהול-פרגו.html` |
| **פרוטוטייפ ראשוני** | דשבורד סטטי ראשוני (היסטורי) | בריפו: `pergo/` |

**לינק חי (האפליקציה העצמאית):**
https://claude.ai/code/artifact/cf2edfa2-0251-4476-9434-a3463682bd72

שני התוצרים הפעילים חולקים את אותה **לוגיקה עסקית ואותם נתונים** (יוצאו מהאקסל של בעל העסק).

---

## 3. ארכיטקטורה (המערכת המלאה)

```
app-code/src/
  app/                     מסכי Next.js (App Router, כל מסך = route)
  components/              AppShell (ניווט), Gauge, JournalForm, Modal, ui, Icon
  lib/
    domain/calc.ts         *כל הלוגיקה העסקית — פונקציות טהורות, בלי I/O*
    domain/types.ts        טיפוסים = סכמת ה-DB
    repo.ts                שכבת גישה לנתונים (Supabase או מנוע מקומי)
    local/localDb.ts       מנוע מקומי (localStorage) תואם-Supabase
    integrations/registry.ts   נקודת הרחבה מודולרית לאינטגרציות עתידיות
    supabase/              client + config
  config/nav.ts            הגדרת ניווט
supabase/
  migrations/0001_init.sql  סכמה מלאה + RLS + generated columns
  seed.sql                  נתוני פתיחה (549 ימי לוח שנה, יומן, משימות, מנות)
```

**החלטות ארכיטקטורה מרכזיות:**

1. **הפרדת לוגיקה מ-UI** — כל החישובים ב-`calc.ts` כפונקציות טהורות (ניתנות לבדיקת יחידה,
   חוזרות שימוש בין המערכת המלאה לאפליקציה העצמאית).
2. **שכבת repository** (`repo.ts`) — המסכים לא ניגשים ל-Supabase ישירות. זו התפר שבו
   אינטגרציות עתידיות (POS/בנק/דיוור) ייכנסו כמודולים נפרדים בלי לשנות מסכים.
3. **מנוע נתונים כפול** — כשמוגדר Supabase בענן משתמשים בו; אחרת נופלים אוטומטית
   ל-`localDb` (localStorage) שמחקה את אותו ממשק שאילתות. מאפשר הרצה מיידית בלי הרשמה,
   ומעבר לענן בלי שינוי קוד במסכים.
4. **מודולריות אינטגרציות** — `integrations/registry.ts` מגדיר interface + registry ריק
   שאליו יירשמו מודולים עתידיים.

---

## 4. מודל נתונים

טבלאות ליבה + טבלאות מודולים: `employees`, `shifts`, `shift_requirements`,
`shift_applications`, `shift_assignments` (לוח משמרות), `dish_evaluations`
(בדיקת מנה), `uploaded_documents` / `document_extracted_data` / `expense_analysis`
/ `expense_recommendations` (ייבוא מסמכים), ועוד. חישובי איוש משמרת
(filled/missing/status/עלות) בשכבת האפליקציה (`shiftFillStatus`) כי הם אגרגציה בין שורות.
**אבטחת מסמכים:** קבצים ב-Supabase Storage בבאקט פרטי (`documents`), עם policy
המתירה גישה למאומתים בלבד — אין חשיפה ציבורית.

**עקרון "כל נתון פעם אחת" ממומש כ-GENERATED COLUMNS ב-Postgres** — שדות מחושבים
לעולם לא מוזנים ידנית:

| טבלה | שדה מחושב | נוסחה |
|------|-----------|--------|
| daily_entries | avg_order | revenue / transactions |
| daily_entries | total_payments | sum(cash, credit, tenbis, wolt, other) |
| daily_entries | revenue_difference | total_payments − revenue |
| daily_entries | cash_to_deposit | cash_received − cash_deposited |
| menu_items | food_cost_percent | food_cost / sale_price × 100 |
| menu_items | gross_profit | sale_price − food_cost |
| dish_evaluations | labor_cost | prep_minutes / 60 × hourly_labor_cost |
| dish_evaluations | total_cost | food + labor + packaging + other |
| dish_evaluations | min_price_by_fc | food_cost / (target_food_cost / 100) |

טבלת `daily_entries` היא **מקור האמת**; תזרים, דשבורד ודוחות נגזרים ממנה.
יתרות רגעיות (בנק/קופה/ספקים) יושבות ב-`cash_flow` כ-snapshots — אין הזנה כפולה.

הסכמה המלאה: `supabase/schema.sql`.

---

## 5. המסכים (13) מול האפיון

| # | מסך | סטטוס | הערות |
|---|------|--------|--------|
| 1 | דשבורד | ✅ מלא | 3 שעונים, נורות התרעה, אירוע קרוב, KPI |
| 2 | יומן יומי | ✅ מלא | הזנה < 2 דק', מילוי אוטומטי יום/עברי/אירוע, חישוב חי, upsert לפי תאריך |
| 3 | תזרים והפקדות | ✅ מלא | יתרות, מזומן להפקדה, התראות |
| 4 | לוח שנה עסקי | ✅ מלא | זיהוי חגים אוטומטי, ספירה לאחור, משימה מומלצת, אחראי |
| 5 | משימות | ✅ מלא | מתוכנן/בתהליך/בוצע/תקוע, תחום, אחראי, עדיפות |
| 6 | לקוחות/טעימות | ✅ מלא | משפך 5 שלבים, יעד רבעוני |
| 7 | תפריט ומנות | ✅ מלא | פוד קוסט מחושב, התראת חריגה |
| 8 | דוחות | ✅ מלא | גרפים (Recharts), מתעלמים מימים ריקים, ייצוא Excel |
| 9 | עובדים + לוח משמרות שבועי | ✅ מלא | תצוגת לוח שנה (7 ימים × בוקר/ערב), דרישות תפקיד, שיבוץ, אישורי מנהל, חוויית עובד (הרשמה למשמרת), סטטוס ירוק/צהוב/אדום, עלות שכר |
| 10 | דוח Z יומי | ✅ מלא | מחולל דוח + שליחה ידנית (מייל); שליחה אוטומטית = מודול עתידי |
| 11 | הגדרות | ✅ מלא | יעדים, שותפים; תשתית תפקידים (לא נאכף) |
| 12 | בדיקת מנה חדשה | ✅ באפליקציה החיה · מבנה נתונים + מנוע חישוב מוכנים במערכת המלאה | ציון כדאיות 1-10, מחיר מומלץ, פוד קוסט, המלצה ירוק/צהוב/אדום, מעבר לתפריט |
| 13 | ייבוא מסמכים | ✅ "תמחיר עובדים" פעיל · שאר הסוגים "בקרוב" | 7 סוגי מסמכים. "תמחיר עובדים" קולט שמות/תפקידים/עלויות לרשימת העובדים (זיהוי טקסט → תצוגה מקדימה → אישור). השאר דורשים עיבוד קבצים בשרת — מבנה נתונים + אחסון מאובטח מוכנים |
| — | פוד קוסט (העלאת דוחות) + AI | 🟡 placeholder | מכוסה ע״י מודול ייבוא מסמכים (expense_analysis / expense_recommendations) |

**הערה על הסדר המחייב:** נבנו קודם Dashboard + יומן ואומתו 100%, ורק אז השאר —
בהתאם לדרישה. שאר המסכים נבנו לאחר שהמשתמש ביקש במפורש "לקודד את כל השלבים".

---

## 6. נוסחאות עסקיות מרכזיות (calc.ts)

- **קצב חודשי משוער** = ממוצע יומי עד כה × ימים בחודש.
- **כמה למכור ליום** = (יעד − מחזור מצטבר) / ימים שנותרו בחודש.
- **אירוע קרוב** = האירוע המשמעותי הקרוב מהיום; אם אין ב-14 יום → "אין אירוע מיוחד בקרוב".
- **התראת הפקדה** = צהוב אם (מזומן שהתקבל − שהופקד) > סף.
- **התראת אי-התאמה** = אדום אם סה"כ אמצעי תשלום ≠ מחזור.
- **גרפים** מתעלמים מימים ללא מחזור (לא מציגים אפסים עתידיים).
- **Dashboard Drill Down**: כל מדד/שעון/כרטיס בדשבורד לחיץ ומוביל למסך המקור עם פילטר מוכן, כותרת "פירוט הנתון" וכפתור חזרה.
- **בדיקת כדאיות מנה** (`evaluateDish`): מחיר מומלץ = הגבוה מבין [מחיר-מינ׳-לפי-פוד-קוסט, עלות-כוללת × מכפיל,
  מחיר פסיכולוגי מעוגל 49/59/69…]; ציון 1-10 = הרכבה של רווחיות (פוד קוסט מול יעד, רווח גולמי) פחות
  סיכון תפעולי (חומר/ציוד חדש, הכשרה, מורכבות, בזבוז) ועוד בונוס לערך עסקי (בעיות שנפתרות, תזמונים);
  צבע ירוק/צהוב/אדום נגזר מהציון + רווח נטו + פוד קוסט.

---

## 7. אימות שבוצע

| מה | איך | תוצאה |
|----|-----|--------|
| סכמת ה-DB | הרצה על **PostgreSQL 16 אמיתי** (הסביבה חסמה Supabase/Docker) | ✅ כל ה-generated columns מחשבים נכון |
| מנוע החישוב | בדיקת יחידה מול נתוני האקסל | ✅ מחזור 21,382 · ממוצע 129 · פילוח 21/13/147 · זיהוי אירועים · חלון 14 יום |
| build | `next build` על כל המסלולים | ✅ עובר, בלי שגיאות טיפוסים |
| רינדור + כתיבה | דפדפן headless — כל המסכים + שמירה שנשמרת אחרי רענון | ✅ אין שגיאות runtime |
| האפליקציה העצמאית | 11 לשוניות נבדקו; תוקן באג בלוח השנה | ✅ |

---

## 8. החלטות ופשרות (לביקורת)

1. **Supabase ענן דורש חשבון של בעל העסק** — לא ניתן לפתוח בשמו. לכן נבנה **מנוע מקומי**
   כברירת מחדל, עם מעבר לענן ב-2 משתני סביבה + הרצת ה-SQL. פשרה: מצב מקומי = מכשיר יחיד,
   בלי סנכרון בין שותפים.
2. **הרשאות נדחו בכוונה** (לפי בקשת "כניסה פשוטה, לא להתעכב") — RLS נוכחי מתיר גישה מלאה
   (`to anon, authenticated`). **סיכון:** לפני חשיפה ציבורית חובה להוסיף Supabase Auth ולהצר
   מדיניות לפי תפקידים.
3. **מודולי AI/פוד-קוסט כ-placeholder** — דורשים תשתית העלאת קבצים + מנוע המלצות; לפי האפיון
   "לא לבנות עכשיו".
4. **האפליקציה העצמאית** מחשבת חלק מהשדות ב-JS (mirror ל-generated columns) — יש להבטיח
   שהנוסחאות זהות בשתי הגרסאות (כרגע כן).

---

## 9. מגבלות ידועות

- מצב מקומי: נתונים בדפדפן בלבד (מחיקת נתוני הדפדפן מוחקת). קיים ייצוא Excel לגיבוי.
- אין אימות משתמשים בשלב זה.
- ייבוא Excel אוטומטי (מעבר לזריעה החד-פעמית) עדיין לא מומש — מופיע כשלב עתידי באפיון.
- אינטגרציית קופת אביב/בנק/WhatsApp — רק תשתית ה-registry קיימת, לא המימוש.

---

## 10. איך מריצים

**אפליקציה עצמאית:** פותחים את `מערכת-ניהול-פרגו.html` בדפדפן. זהו.

**מערכת מלאה:**
```bash
cd app-code
npm install
# להרצה מקומית מיידית: npm run dev  (מצב מקומי, בלי Supabase)
# לחיבור ענן: מריצים supabase/schema.sql + seed.sql בפרויקט Supabase,
#             וממלאים .env.local מ-.env.local.example
npm run dev   # http://localhost:3000
```

---

## 11. שאלות ממוקדות למבקר (Gemini)

1. **ארכיטקטורה:** האם הפרדת `calc.ts` / `repo.ts` / `localDb` נכונה, או over-engineering
   ביחס לגודל הפרויקט (מסעדה אחת)?
2. **מנוע כפול (ענן/מקומי):** האם זו פשרה סבירה, או שעדיף להתעקש על Supabase בלבד?
3. **אבטחה:** בהנחה שהמערכת תיחשף, מהו המינימום להוספה מיידית מעבר ל-Auth + RLS לפי תפקיד?
4. **מודל הנתונים:** האם החלוקה daily_entries (מקור אמת) מול cash_flow (snapshots) נכונה,
   או שיש כפילות/סיכון לחוסר עקביות?
5. **UX:** האם ההזנה היומית באמת < 2 דקות? מה הייתם משנים כדי להקטין חיכוך?
6. **קוד:** נקודות תורפה בקריאות/תחזוקה? (במיוחד `calc.ts`, `JournalForm.tsx`, `localDb.ts`).
7. **שלמות מול אפיון:** מה חסר או מומש חלקית מול הדרישות המקוריות?
8. **המשך:** מה סדר העדיפויות המומלץ — Auth, ייבוא Excel, מודול פוד-קוסט, או אינטגרציית POS?

---

*נבנה עבור פיצה פרגו – צור הדסה. הקוד המלא בתיקיית `app-code/`; הנתונים המקוריים
ב-`נתוני-מקור-לוח-מכוונים.xlsx`; הסכמה ב-`supabase/`.*

---

## חלק 2 — סכמת מסד הנתונים (Supabase / Postgres)

### supabase/migrations/0001_init.sql
```sql
-- ============================================================================
-- מערכת ניהול פרגו — Initial schema
-- Single source of truth = daily_entries. Computed fields are GENERATED columns
-- so no value is ever entered twice.
-- ============================================================================

-- ---------- settings (singleton) ----------
create table if not exists settings (
  id                 int primary key default 1,
  business_name      text    not null default 'פרגו',
  location           text             default 'צור הדסה',
  monthly_target     numeric not null default 210000,
  avg_order_target   numeric not null default 90,
  food_cost_target   numeric not null default 34,
  cash_deposit_alert numeric not null default 5000,   -- ₪ threshold for deposit warning
  partners           text[]  not null default array['מרדכי','אנה'],
  updated_at         timestamptz default now(),
  constraint settings_singleton check (id = 1)
);

-- ---------- daily_entries (מקור האמת) ----------
create table if not exists daily_entries (
  id             uuid primary key default gen_random_uuid(),
  date           date not null unique,
  hebrew_date    text,
  weekday        text,
  event          text,
  revenue        numeric,
  transactions   integer,
  deliveries     integer,
  pickup         integer,
  dine_in        integer,
  cash_received  numeric,
  credit_received numeric,
  tenbis_sibus   numeric,
  wolt_mishloha  numeric,
  other_payment  numeric,
  cash_deposited numeric,
  notes          text,
  -- ---- computed (single source principle) ----
  avg_order numeric generated always as (
    case when coalesce(transactions,0) > 0 then round(revenue / transactions, 2) else null end
  ) stored,
  total_payments numeric generated always as (
    coalesce(cash_received,0)+coalesce(credit_received,0)+coalesce(tenbis_sibus,0)
    +coalesce(wolt_mishloha,0)+coalesce(other_payment,0)
  ) stored,
  revenue_difference numeric generated always as (
    (coalesce(cash_received,0)+coalesce(credit_received,0)+coalesce(tenbis_sibus,0)
     +coalesce(wolt_mishloha,0)+coalesce(other_payment,0)) - coalesce(revenue,0)
  ) stored,
  cash_to_deposit numeric generated always as (
    coalesce(cash_received,0) - coalesce(cash_deposited,0)
  ) stored,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_daily_entries_date on daily_entries(date);

-- ---------- business_calendar (לוח שנה עסקי) ----------
create table if not exists business_calendar (
  id                 uuid primary key default gen_random_uuid(),
  date               date not null unique,
  hebrew_date        text,
  weekday            text,
  event_name         text,
  importance         text,                 -- גבוהה / בינונית / רגילה
  recommended_action text,
  owner              text,
  status             text default 'פתוח',  -- פתוח / בתהליך / בוצע
  created_at         timestamptz default now()
);
create index if not exists idx_business_calendar_date on business_calendar(date);

-- ---------- tasks ----------
create table if not exists tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  category   text,                       -- שיווק/תפריט/תפעול/כספים/ספקים/שירות/עובדים/כשרות
  owner      text,
  due_date   date,
  status     text not null default 'מתוכנן',  -- מתוכנן/בתהליך/בוצע/תקוע
  priority   text default 'רגילה',            -- גבוהה/רגילה/נמוכה
  notes      text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- leads (לקוחות פוטנציאליים / טעימות) ----------
create table if not exists leads (
  id                   uuid primary key default gen_random_uuid(),
  business_name        text not null,
  category             text,             -- בית ספר/ישיבה/עסק/משרד/מוסד
  contact_name         text,
  role                 text,
  phone                text,
  address              text,
  tasting_item         text,
  personal_letter_sent boolean default false,
  delivery_date        date,
  funnel_stage         text default 'אותר',  -- אותר/טעימה נשלחה/שיחת מעקב/הזמנה ראשונה/לקוח קבוע
  followup_date        date,
  first_order          boolean default false,
  notes                text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- ---------- menu_items ----------
create table if not exists menu_items (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  category           text,
  sale_price         numeric,
  food_cost          numeric,
  prep_time          integer,            -- minutes
  requires_equipment boolean default false,
  requires_training  boolean default false,
  campaign_fit       text,
  status             text default 'רעיון',  -- רעיון/בבדיקה/בפיילוט/פעיל/ירד
  notes              text,
  food_cost_percent numeric generated always as (
    case when coalesce(sale_price,0) > 0 then round((food_cost / sale_price) * 100, 1) else null end
  ) stored,
  gross_profit numeric generated always as (
    coalesce(sale_price,0) - coalesce(food_cost,0)
  ) stored,
  created_at timestamptz default now()
);

-- ---------- cash_flow (יתרות רגעיות / snapshots) ----------
create table if not exists cash_flow (
  id                     uuid primary key default gen_random_uuid(),
  date                   date not null default current_date,
  bank_balance           numeric,
  cash_in_register       numeric,
  open_supplier_payments numeric,
  notes                  text,
  created_at             timestamptz default now()
);
create index if not exists idx_cash_flow_date on cash_flow(date desc);

-- ============================================================================
-- Future modules — tables created now so the architecture is ready, screens
-- are built later (employees, weekly schedule, employee events).
-- ============================================================================
create table if not exists employees (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  role                text,
  hourly_cost         numeric,
  employer_cost       numeric,
  weekly_availability jsonb,
  status              text default 'פעיל',  -- פעיל/בהשהיה/סיים
  internal_rating     numeric,
  notes               text,
  created_at          timestamptz default now()
);

create table if not exists shifts (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  shift_type    text,                     -- בוקר/צהריים/ערב
  employee_id   uuid references employees(id) on delete set null,
  role          text,
  planned_hours numeric,
  notes         text,
  created_at    timestamptz default now()
);
create index if not exists idx_shifts_date on shifts(date);

create table if not exists employee_events (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid references employees(id) on delete cascade,
  date                date not null default current_date,
  event_type          text,               -- תלונה/איחור/חוסר מקצועיות/שבח/אירוע חריג
  description         text,
  reported_by         text,
  severity            text,               -- נמוכה/בינונית/גבוהה
  action_taken        text,
  management_decision text,
  created_at          timestamptz default now()
);

-- ============================================================================
-- Row Level Security.
-- Step 1: single-workspace, simple access. Policies allow the anon + auth keys
-- full access so the app works immediately without a complex permission system.
-- Tighten these (per-role) when the roles module is built.
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'settings','daily_entries','business_calendar','tasks','leads',
    'menu_items','cash_flow','employees','shifts','employee_events'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format($p$create policy "pergo_all_%1$s" on %1$I for all to anon, authenticated using (true) with check (true);$p$, t);
  end loop;
end $$;

-- keep updated_at fresh
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['settings','daily_entries','tasks','leads'] loop
    execute format('drop trigger if exists trg_touch_%1$s on %1$I;', t);
    execute format('create trigger trg_touch_%1$s before update on %1$I
                    for each row execute function touch_updated_at();', t);
  end loop;
end $$;
```

### supabase/migrations/0002_dish_evaluations.sql
```sql
-- ============================================================================
-- מודול "בדיקת מנה חדשה" — מבנה נתונים.
-- מוכן מראש כך שקל להוסיף את המסך המלא בהמשך (הלוגיקה כבר קיימת ב-lib/domain/calc).
-- שדות מחושבים = GENERATED COLUMNS, בהתאם לעקרון "כל נתון פעם אחת".
-- ============================================================================
create table if not exists dish_evaluations (
  id                 uuid primary key default gen_random_uuid(),
  -- 1. פרטי המנה
  name               text not null,
  category           text,                 -- פיצה/פסטה/דג/סלט/קינוח/שתייה/אחר
  description        text,
  kind               text default 'קבועה', -- קבועה / עונתית / קמפיין
  -- 2. עלויות
  food_cost          numeric,              -- חומרי גלם
  prep_minutes       numeric,
  hourly_labor_cost  numeric,
  packaging_cost     numeric,
  other_costs        numeric,
  -- 3. תמחור
  manual_price       numeric,
  target_food_cost   numeric default 34,   -- %
  profit_multiplier  numeric default 3,
  justify_target     numeric default 1500, -- תרומה חודשית לצידוק
  -- 4/5. ביקוש ותפעול (רב-ערכי -> jsonb / bool)
  audience           jsonb,                -- מערך קהלי יעד
  timing             jsonb,                -- מערך זמני מכירה
  solves             jsonb,                -- מערך בעיות עסקיות שנפתרות
  new_ingredient     boolean default false,
  new_equipment      boolean default false,
  needs_training     boolean default false,
  can_prep_ahead     boolean default false,
  complexity         text default 'בינונית', -- נמוכה/בינונית/גבוהה
  waste_risk         text default 'נמוך',     -- נמוך/בינוני/גבוה
  shelf_life         text,
  -- 6. פיילוט
  pilot              boolean default false,
  pilot_start        date,
  pilot_end          date,
  pilot_sales_target numeric,
  pilot_gross_target numeric,
  pilot_actual       numeric,
  decision           text,                 -- להכניס לתפריט / להמשיך פיילוט / להוריד
  -- מחוברת למנה בתפריט אם אושרה
  menu_item_id       uuid references menu_items(id) on delete set null,
  -- ---- מחושב (single source) ----
  labor_cost numeric generated always as (
    coalesce(prep_minutes,0) / 60.0 * coalesce(hourly_labor_cost,0)
  ) stored,
  total_cost numeric generated always as (
    coalesce(food_cost,0) + (coalesce(prep_minutes,0)/60.0*coalesce(hourly_labor_cost,0))
    + coalesce(packaging_cost,0) + coalesce(other_costs,0)
  ) stored,
  min_price_by_fc numeric generated always as (
    case when coalesce(target_food_cost,0) > 0 then round(food_cost / (target_food_cost/100.0), 2) else null end
  ) stored,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_dish_eval_created on dish_evaluations(created_at desc);

-- RLS (עקבי עם שאר הטבלאות בשלב 1)
alter table dish_evaluations enable row level security;
create policy "pergo_all_dish_evaluations" on dish_evaluations
  for all to anon, authenticated using (true) with check (true);

drop trigger if exists trg_touch_dish_eval on dish_evaluations;
create trigger trg_touch_dish_eval before update on dish_evaluations
  for each row execute function touch_updated_at();
```

### supabase/migrations/0003_weekly_shifts.sql
```sql
-- ============================================================================
-- מודול "לוח משמרות שבועי" — מבנה נתונים (מוכן להשלמת המסך בהמשך).
-- מפריד בין משמרת, דרישות תפקיד, בקשות עובד, ושיבוצים מאושרים.
-- חישובים (filled/missing/status/estimated_cost) נעשים בשכבת האפליקציה
-- (domain/calc.ts → shiftFillStatus) כי הם אגרגציה בין שורות.
-- ============================================================================

-- הרחבת employees בהתאם למודל החדש
alter table employees add column if not exists phone text;

-- הרחבת shifts (שדות לוח שנה)
alter table shifts add column if not exists day_name   text;
alter table shifts add column if not exists start_time time;
alter table shifts add column if not exists end_time   time;
alter table shifts add column if not exists status     text default 'open';
-- shift_type כבר קיים; ערכים: morning / evening / motzaei_shabbat / custom

-- כמה נדרש מכל תפקיד במשמרת
create table if not exists shift_requirements (
  id             uuid primary key default gen_random_uuid(),
  shift_id       uuid not null references shifts(id) on delete cascade,
  role           text not null,          -- cook / waitress / hostess
  required_count integer not null default 1,
  unique (shift_id, role)
);
create index if not exists idx_shift_req_shift on shift_requirements(shift_id);

-- בקשות עובד להירשם למשמרת
create table if not exists shift_applications (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid not null references shifts(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  role        text not null,
  status      text not null default 'pending',  -- pending / approved / rejected
  created_at  timestamptz default now(),
  unique (shift_id, employee_id)
);
create index if not exists idx_shift_app_shift on shift_applications(shift_id);

-- שיבוצים מאושרים
create table if not exists shift_assignments (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid not null references shifts(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  role        text not null,
  approved_by uuid references employees(id) on delete set null,
  created_at  timestamptz default now(),
  unique (shift_id, employee_id)
);
create index if not exists idx_shift_assign_shift on shift_assignments(shift_id);

-- RLS (עקבי עם שאר המערכת בשלב 1)
do $$
declare t text;
begin
  foreach t in array array['shift_requirements','shift_applications','shift_assignments'] loop
    execute format('alter table %I enable row level security;', t);
    execute format($p$create policy "pergo_all_%1$s" on %1$I for all to anon, authenticated using (true) with check (true);$p$, t);
  end loop;
end $$;
```

### supabase/migrations/0004_documents.sql
```sql
-- ============================================================================
-- מודול "ייבוא מסמכים" — מבנה נתונים בלבד (המסך המלא = "בקרוב").
-- זרימה: העלאה → ניתוח → טבלת תצוגה מקדימה → אישור משתמש → קליטה.
-- אין עדכון אוטומטי ללא אישור; קבצים באחסון פרטי (Supabase Storage).
-- ============================================================================

-- מסמכים שהועלו
create table if not exists uploaded_documents (
  id            uuid primary key default gen_random_uuid(),
  document_type text not null,   -- employee_costing / z_daily / profit_loss / trial_balance / suppliers_ledger / raw_material_purchases / sales_report
                                 -- (employee_costing -> target_table='employees': שמות, תפקידים, עלות שעתית)
  file_name     text,
  file_path     text,            -- נתיב ב-Supabase Storage (bucket: documents)
  period_start  date,
  period_end    date,
  uploaded_by   text,
  uploaded_at   timestamptz default now(),
  status        text not null default 'uploaded',  -- uploaded / parsed / approved / rejected
  notes         text
);
create index if not exists idx_uploaded_docs_type on uploaded_documents(document_type, uploaded_at desc);

-- נתונים שחולצו מהמסמך — ממתינים לאישור לפני קליטה
create table if not exists document_extracted_data (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references uploaded_documents(id) on delete cascade,
  field_name       text,          -- שם הנתון שנמצא
  extracted_value  text,          -- הערך שחולץ
  target_table     text,          -- לאן ייכנס (למשל daily_entries)
  target_field     text,
  existing_value   text,          -- ערך קיים במערכת, אם יש
  confidence_score numeric,       -- 0..1
  status           text not null default 'pending'  -- pending / approved / rejected
);
create index if not exists idx_doc_extracted_doc on document_extracted_data(document_id);

-- ניתוח הוצאות לתקופה (מדוח רווח והפסד)
create table if not exists expense_analysis (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid references uploaded_documents(id) on delete set null,
  period_start     date,
  period_end       date,
  revenue          numeric,
  food_cost        numeric,
  labor_cost       numeric,
  rent             numeric,
  utilities        numeric,
  accounting       numeric,
  marketing        numeric,
  commissions      numeric,
  delivery_costs   numeric,
  other_expenses   numeric,
  operating_profit numeric,
  net_profit       numeric,
  created_at       timestamptz default now()
);

-- המלצות AI לצמצום עלויות
create table if not exists expense_recommendations (
  id             uuid primary key default gen_random_uuid(),
  analysis_id    uuid references expense_analysis(id) on delete cascade,
  category       text,
  severity       text,   -- green / yellow / red
  recommendation text,
  created_at     timestamptz default now()
);
create index if not exists idx_expense_rec_analysis on expense_recommendations(analysis_id);

-- RLS (עקבי עם שאר המערכת בשלב 1)
do $$
declare t text;
begin
  foreach t in array array['uploaded_documents','document_extracted_data','expense_analysis','expense_recommendations'] loop
    execute format('alter table %I enable row level security;', t);
    execute format($p$create policy "pergo_all_%1$s" on %1$I for all to anon, authenticated using (true) with check (true);$p$, t);
  end loop;
end $$;

-- ---------- אחסון מאובטח (רץ רק ב-Supabase, נדלג על Postgres רגיל) ----------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
      values ('documents', 'documents', false)
      on conflict (id) do nothing;
    -- רק משתמשים מאומתים רואים/מנהלים את הקבצים — לא ציבורי
    begin
      execute $p$create policy "pergo_docs_authenticated" on storage.objects
        for all to authenticated
        using (bucket_id = 'documents') with check (bucket_id = 'documents');$p$;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
```

---

## חלק 3 — קוד המקור המלא (Next.js + TypeScript)

### src/app/ai/page.tsx
```tsx
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export default function AiPage() {
  return (
    <ModulePlaceholder
      icon="sparkles"
      title="המלצות AI לניהול"
      intro="מנוע המלצות שמתריע על חריגות ונותן המלצות ניהוליות — לא מחליף מנהל, ולא נותן ייעוץ משפטי בדיני עבודה."
      points={[
        "עובד עם עלות גבוהה ביחס לערך שהוא מייצר",
        "ימים עם עודף/חוסר עובדים ביחס למחזור צפוי",
        "תלונות חוזרות על עובד",
        "פער בין שעות מתוכננות לשעות בפועל",
        "דוגמה: ‘בשישי היו יותר מדי שעות ביחס למחזור — לשקול מודל שישי מצומצם’",
      ]}
    />
  );
}
```

### src/app/calendar/page.tsx
```tsx
"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo, update } from "@/lib/repo";
import type { CalendarDay } from "@/lib/domain/types";
import { DataState, EmptyState, Badge, DrillBanner } from "@/components/ui";
import { gregDate, todayISO } from "@/lib/format";
import { useDrill } from "@/hooks/useDrill";

const STATUSES = ["פתוח", "בתהליך", "בוצע"];
const MAJOR = new Set(["בין המצרים", "תשעת הימים", "תשעה באב", "ט״ו באב", "ראש השנה", "יום כיפור", "סוכות", "חנוכה", "פורים", "פסח", "שבועות"]);

export default function CalendarPage() {
  const { data, loading, error, configured, reload } = useData(() => repo.calendar());
  const [onlyHolidays, setOnlyHolidays] = useState(true);
  const today = todayISO();
  const drill = useDrill();

  return (
    <DataState configured={configured} loading={loading} error={error}>
      <DrillBanner label={drill.label} />
      <div className="flex gap-1.5 mb-4">
        <Chip active={onlyHolidays} onClick={() => setOnlyHolidays(true)}>חגים ואירועים</Chip>
        <Chip active={!onlyHolidays} onClick={() => setOnlyHolidays(false)}>כל הימים המסומנים</Chip>
      </div>

      {data && (() => {
        const rows = data
          .filter((c) => c.date >= today && c.event_name)
          .filter((c) => (onlyHolidays ? MAJOR.has(c.event_name!.trim()) : true))
          .slice(0, 80);
        if (rows.length === 0) return <EmptyState icon="calendar-days" title="אין אירועים קרובים" />;
        return (
          <div className="grid gap-2.5">
            {rows.map((c) => {
              const days = Math.round((new Date(c.date).getTime() - new Date(today).getTime()) / 86400000);
              return (
                <div key={c.id} className="card p-4 flex gap-3 items-start">
                  <div className="grid place-items-center rounded-xl shrink-0 text-center" style={{ width: 56, height: 56, background: "var(--surface-2)" }}>
                    <div className="font-extrabold text-lg leading-none">{days === 0 ? "היום" : days}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-mute)" }}>{days === 0 ? "" : "ימים"}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{c.event_name}</span>
                      {c.importance && <Badge level={c.importance === "גבוהה" ? "bad" : "warn"}>{c.importance}</Badge>}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>
                      {gregDate(c.date)} · {c.weekday} · {c.hebrew_date}
                    </div>
                    {c.recommended_action && (
                      <div className="text-sm mt-2 p-2 rounded-lg" style={{ background: "var(--surface-2)" }}>{c.recommended_action}</div>
                    )}
                    <div className="flex gap-2 items-center mt-2 flex-wrap">
                      {c.owner && <Badge>👤 {c.owner}</Badge>}
                      <select className="chip" style={{ cursor: "pointer" }} value={c.status ?? "פתוח"}
                        onChange={async (e) => { await update<CalendarDay>("business_calendar", c.id, { status: e.target.value }); reload(); }}>
                        {STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </DataState>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="chip" style={{ background: active ? "var(--brand)" : undefined, color: active ? "#fff" : undefined, borderColor: active ? "transparent" : undefined, cursor: "pointer" }}>
      {children}
    </button>
  );
}
```

### src/app/cashflow/page.tsx
```tsx
"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo, insert } from "@/lib/repo";
import type { CashFlowSnapshot } from "@/lib/domain/types";
import { cashStatus } from "@/lib/domain/calc";
import { DataState, StatCard, Section, DrillBanner } from "@/components/ui";
import { Modal, Field } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { money, todayISO } from "@/lib/format";
import { useDrill } from "@/hooks/useDrill";

export default function CashflowPage() {
  const { data, loading, error, configured, reload } = useData(async () => {
    const [entries, settings, cashFlow] = await Promise.all([repo.dailyEntries(), repo.settings(), repo.cashFlow()]);
    return { entries, settings, cashFlow };
  });
  const [edit, setEdit] = useState(false);
  const drill = useDrill();

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && (() => {
        const snap = data.cashFlow[0] ?? null;
        const c = cashStatus(data.entries, snap, data.settings);
        return (
          <>
            <DrillBanner label={drill.label} />
            {c.depositWarn && <Alert level="warn" text={`יש ${money(c.cashToDeposit)} מזומן שטרם הופקד לבנק — מומלץ להפקיד.`} />}
            {c.diffAlert && <Alert level="bad" text="קיים הפרש בין סה״כ אמצעי התשלום למחזור — דורש בדיקה." />}

            <Section title="יתרות נוכחיות" action={<button className="btn btn-sm" onClick={() => setEdit(true)}><Icon name="pencil" size={15} /> עדכון יתרות</button>}>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
                <StatCard label="יתרת בנק" value={money(c.bankBalance)} icon="banknote" />
                <StatCard label="מזומן בקופה" value={money(c.cashInRegister)} icon="banknote" />
                <StatCard label="תשלומים פתוחים לספקים" value={money(c.openSupplierPayments)} icon="receipt" level={c.openSupplierPayments > 0 ? "warn" : undefined} />
              </div>
            </Section>

            <Section title="מזומן והפקדות (החודש)">
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
                <StatCard label="מזומן שהתקבל" value={money(c.cashReceivedMonth)} icon="arrow-down" />
                <StatCard label="מזומן שהופקד" value={money(c.cashDepositedMonth)} icon="arrow-up" />
                <StatCard label="עדיין צריך להפקיד" value={money(c.cashToDeposit)} level={c.depositWarn ? "warn" : "good"} icon="banknote" />
                <StatCard label="הפרש מול מחזור" value={money(c.revenueDiff)} level={c.diffAlert ? "bad" : "good"} icon="alert-triangle" />
              </div>
              <p className="text-xs mt-3" style={{ color: "var(--text-mute)" }}>
                נתוני המזומן וההפקדות מחושבים אוטומטית מהיומן היומי — אין צורך להזין פעמיים.
              </p>
            </Section>

            {snap?.notes && <div className="card p-4 text-sm"><b>הערות תזרים:</b> {snap.notes}</div>}

            {edit && <SnapshotModal onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} last={snap} />}
          </>
        );
      })()}
    </DataState>
  );
}

function Alert({ level, text }: { level: "warn" | "bad"; text: string }) {
  const c = level === "bad" ? "var(--bad)" : "var(--warn)";
  const bg = level === "bad" ? "var(--bad-bg)" : "var(--warn-bg)";
  return (
    <div className="card p-3.5 mb-4 flex items-center gap-3" style={{ borderInlineStartWidth: 4, borderInlineStartColor: c, background: bg }}>
      <Icon name="alert-triangle" size={20} className="shrink-0" />
      <div className="text-sm font-semibold">{text}</div>
    </div>
  );
}

function SnapshotModal({ onClose, onSaved, last }: { onClose: () => void; onSaved: () => void; last: CashFlowSnapshot | null }) {
  const [bank, setBank] = useState(last?.bank_balance != null ? String(last.bank_balance) : "");
  const [cash, setCash] = useState(last?.cash_in_register != null ? String(last.cash_in_register) : "");
  const [sup, setSup] = useState(last?.open_supplier_payments != null ? String(last.open_supplier_payments) : "");
  const [notes, setNotes] = useState(last?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await insert<CashFlowSnapshot>("cash_flow", {
      date: todayISO(),
      bank_balance: bank === "" ? null : Number(bank),
      cash_in_register: cash === "" ? null : Number(cash),
      open_supplier_payments: sup === "" ? null : Number(sup),
      notes: notes || null,
    });
    setSaving(false); onSaved();
  }

  return (
    <Modal title="עדכון יתרות" onClose={onClose}
      footer={<button className="btn" onClick={save} disabled={saving}><Icon name="check" size={16} /> שמירה</button>}>
      <div className="grid gap-3">
        <Field label="יתרת בנק (₪)"><input type="number" className="field" value={bank} onChange={(e) => setBank(e.target.value)} /></Field>
        <Field label="מזומן בקופה (₪)"><input type="number" className="field" value={cash} onChange={(e) => setCash(e.target.value)} /></Field>
        <Field label="תשלומים פתוחים לספקים (₪)"><input type="number" className="field" value={sup} onChange={(e) => setSup(e.target.value)} /></Field>
        <Field label="הערות תזרים"><input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
```

### src/app/dashboard/page.tsx
```tsx
"use client";

import Link from "next/link";
import { useData } from "@/hooks/useData";
import { repo } from "@/lib/repo";
import {
  cashStatus, monthMetrics, nextBusinessEvent, taskSummary, warningLights,
} from "@/lib/domain/calc";
import { money, nf } from "@/lib/format";
import { DataState, Section, StatCard, Badge } from "@/components/ui";
import { Gauge } from "@/components/Gauge";
import { Icon } from "@/components/Icon";

export default function DashboardPage() {
  const { data, loading, error, configured } = useData(async () => {
    const [entries, settings, calendar, tasks, cashFlow] = await Promise.all([
      repo.dailyEntries(), repo.settings(), repo.calendar(), repo.tasks(), repo.cashFlow(),
    ]);
    return { entries, settings, calendar, tasks, cashFlow };
  });

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && <DashboardBody {...data} />}
    </DataState>
  );
}

function DashboardBody({ entries, settings, calendar, tasks, cashFlow }: {
  entries: Awaited<ReturnType<typeof repo.dailyEntries>>;
  settings: Awaited<ReturnType<typeof repo.settings>>;
  calendar: Awaited<ReturnType<typeof repo.calendar>>;
  tasks: Awaited<ReturnType<typeof repo.tasks>>;
  cashFlow: Awaited<ReturnType<typeof repo.cashFlow>>;
}) {
  const m = monthMetrics(entries, settings);
  const cash = cashStatus(entries, cashFlow[0] ?? null, settings);
  const ev = nextBusinessEvent(calendar);
  const ts = taskSummary(tasks);
  const lights = warningLights({ metrics: m, cash, tasks: ts, nextEvent: ev, settings });

  const paceLevel = m.pacePct >= 1 ? "good" : m.pacePct >= 0.85 ? "warn" : "bad";
  const aoLevel = m.avgOrder >= settings.avg_order_target ? "good" : m.avgOrder >= settings.avg_order_target * 0.8 ? "warn" : "bad";
  // drill-down URL builder: every metric links to its source screen with a filter
  const dl = (path: string, filter: string | null, label: string) =>
    `${path}?${filter ? `filter=${filter}&` : ""}label=${encodeURIComponent(label)}`;

  return (
    <>
      {/* Warning lights */}
      <Section>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          {lights.map((l, i) => {
            const c = l.level === "good" ? "var(--good)" : l.level === "warn" ? "var(--warn)" : "var(--bad)";
            const bg = l.level === "good" ? "var(--good-bg)" : l.level === "warn" ? "var(--warn-bg)" : "var(--bad-bg)";
            const href =
              l.icon === "banknote" ? dl("/cashflow", "deposit", "מזומן שצריך להפקיד") :
              l.icon === "alert-triangle" ? dl("/journal", "diff", "ימים עם הפרש מול אמצעי תשלום") :
              l.icon === "calendar" ? dl("/calendar", null, "אירוע עסקי קרוב") :
              l.icon === "circle-alert" ? dl("/tasks", "תקוע", "משימות תקועות") :
              l.icon.startsWith("trending") ? dl("/journal", "month", "מחזור החודש") : null;
            const inner = (
              <>
                <div className="grid place-items-center w-9 h-9 rounded-lg shrink-0" style={{ background: bg, color: c }}>
                  <Icon name={l.icon} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm truncate">{l.title}</div>
                  <div className="text-xs truncate" style={{ color: "var(--text-dim)" }}>{l.detail}</div>
                </div>
                {href && <span className="font-extrabold" style={{ color: c }}>›</span>}
              </>
            );
            const cls = "card p-3.5 flex items-center gap-3";
            const st = { borderInlineStartWidth: 4, borderInlineStartColor: c } as const;
            return href
              ? <Link key={i} href={href} className={cls} style={st}>{inner}</Link>
              : <div key={i} className={cls} style={st}>{inner}</div>;
          })}
        </div>
      </Section>

      {/* Gauges */}
      <Section title="שעוני מחוונים">
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
          <Link href={dl("/journal", "month", "מחזור החודש")} className="card p-5 block" style={{ cursor: "pointer" }}>
            <Gauge value={m.cumulative} max={m.target} label={`מחזור ${m.monthLabel}`} display={money(m.cumulative)} />
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <Meta k="יעד חודשי" v={money(m.target)} />
              <Meta k="נותר ליעד" v={money(m.remaining)} level={m.remaining ? "warn" : "good"} />
              <Meta k="% מהיעד" v={`${Math.round(m.pctOfTarget * 100)}%`} level={paceLevel} />
            </div>
            <div className="text-[11px] font-bold mt-2 text-center" style={{ color: "var(--brand)" }}>לחץ לפירוט ›</div>
          </Link>

          <Link href={dl("/journal", "month", "קצב חודשי משוער")} className="card p-5 block" style={{ cursor: "pointer" }}>
            <Gauge value={m.pace} max={m.target * 1.2} label="קצב חודשי משוער"
              display={money(m.pace)}
              zones={[{ to: 0.5 / 1.2, color: "#dc2626" }, { to: 0.83 / 1.2, color: "#d97706" }, { to: 1, color: "#16a34a" }]} />
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <Meta k="ממוצע יומי" v={money(m.avgDaily)} />
              <Meta k="ימים עם נתונים" v={`${m.daysWithData}/${m.daysInMonth}`} />
              <Meta k="למכור ליום" v={money(m.neededPerDay)} level="warn" />
            </div>
            <div className="text-[11px] font-bold mt-2 text-center" style={{ color: "var(--brand)" }}>לחץ לפירוט ›</div>
          </Link>

          <Link href={dl("/journal", "month", "ממוצע הזמנה")} className="card p-5 block" style={{ cursor: "pointer" }}>
            <Gauge value={m.avgOrder} max={settings.avg_order_target * 2} label="ממוצע הזמנה"
              display={money(m.avgOrder)} />
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <Meta k="יעד" v={money(settings.avg_order_target)} />
              <Meta k="עסקאות" v={nf(m.transactions)} />
              <Meta k="מצב" v={m.avgOrder >= settings.avg_order_target ? "מעל" : "מתחת"} level={aoLevel} />
            </div>
            <div className="text-[11px] font-bold mt-2 text-center" style={{ color: "var(--brand)" }}>לחץ לפירוט ›</div>
          </Link>
        </div>
      </Section>

      {/* KPI row */}
      <Section title="תמונת מצב">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
          <StatCard label="מחזור היום" value={money(m.todayRevenue)} icon="banknote" href={dl("/journal", "today", "מחזור היום")} />
          <StatCard label="משלוחים" value={nf(m.deliveries)} icon="send" href={dl("/journal", "month", "משלוחים החודש")} />
          <StatCard label="איסוף עצמי" value={nf(m.pickup)} icon="clock" href={dl("/journal", "month", "איסוף עצמי")} />
          <StatCard label="ישיבה במקום" value={nf(m.dineIn)} icon="utensils" href={dl("/journal", "month", "ישיבה במקום")} />
          <StatCard label="יתרת בנק" value={money(cash.bankBalance)} icon="banknote" href={dl("/cashflow", null, "יתרת בנק")} />
          <StatCard label="מזומן בקופה" value={money(cash.cashInRegister)} icon="banknote" href={dl("/cashflow", null, "מזומן בקופה")} />
          <StatCard label="מזומן להפקדה" value={money(cash.cashToDeposit)} level={cash.depositWarn ? "warn" : "good"} icon="arrow-up" href={dl("/cashflow", "deposit", "מזומן שצריך להפקיד")} />
          <StatCard label="הפרש אמצעי תשלום" value={money(cash.revenueDiff)} level={cash.diffAlert ? "bad" : "good"} icon="alert-triangle" href={dl("/journal", "diff", "הפרש מול אמצעי תשלום")} />
        </div>
      </Section>

      {/* Event + tasks */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-extrabold">אירוע עסקי קרוב</h2>
            <Link href={dl("/calendar", null, "אירוע עסקי קרוב")} className="text-sm" style={{ color: "var(--brand)" }}>לוח שנה ←</Link>
          </div>
          {ev ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold">{ev.active ? "🔴 " : ""}{ev.event}</span>
                {ev.importance && <Badge level={ev.importance === "גבוהה" ? "bad" : "warn"}>חשיבות {ev.importance}</Badge>}
              </div>
              <div className="text-sm font-semibold mt-1" style={{ color: "var(--warn)" }}>
                {ev.active ? "בתקופה זו כעת" : `בעוד ${ev.daysUntil} ימים`}
              </div>
              {ev.action && (
                <div className="mt-3 p-3 rounded-lg text-sm" style={{ background: "var(--surface-2)" }}>
                  <div className="text-xs mb-0.5" style={{ color: "var(--text-mute)" }}>המשימה הבאה להכנה</div>
                  {ev.action}
                </div>
              )}
              {ev.owner && <div className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>אחראי: <b>{ev.owner}</b></div>}
            </>
          ) : (
            <div className="text-sm" style={{ color: "var(--text-dim)" }}>אין אירוע מיוחד בקרוב</div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-extrabold">משימות</h2>
            <Link href={dl("/tasks", "open", "משימות פתוחות")} className="text-sm" style={{ color: "var(--brand)" }}>כל המשימות ←</Link>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <Link href={dl("/tasks", "בתהליך", "משימות בתהליך")} className="block"><Meta k="בתהליך" v={nf(ts.inProgress)} level="warn" /></Link>
            <Link href={dl("/tasks", "תקוע", "משימות תקועות")} className="block"><Meta k="תקועות" v={nf(ts.stuck)} level={ts.stuck ? "bad" : "good"} /></Link>
            <Link href={dl("/tasks", "open", "משימות פתוחות")} className="block"><Meta k="פתוחות" v={nf(ts.open)} /></Link>
          </div>
          {ts.nearest ? (
            <div className="p-3 rounded-lg text-sm" style={{ background: "var(--surface-2)" }}>
              <div className="text-xs mb-0.5" style={{ color: "var(--text-mute)" }}>המשימה הקרובה</div>
              <div className="font-bold">{ts.nearest.title}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>
                {[ts.nearest.owner, ts.nearest.category, ts.nearest.status].filter(Boolean).join(" · ")}
              </div>
            </div>
          ) : <div className="text-sm" style={{ color: "var(--text-dim)" }}>אין משימות פתוחות</div>}
        </div>
      </div>
    </>
  );
}

function Meta({ k, v, level }: { k: string; v: string; level?: "good" | "warn" | "bad" }) {
  const c = level === "good" ? "var(--good)" : level === "warn" ? "var(--warn)" : level === "bad" ? "var(--bad)" : "var(--text)";
  return (
    <div className="rounded-lg py-2" style={{ background: "var(--surface-2)" }}>
      <div className="text-[11px]" style={{ color: "var(--text-mute)" }}>{k}</div>
      <div className="font-extrabold text-sm" style={{ color: c }}>{v}</div>
    </div>
  );
}
```

### src/app/documents/page.tsx
```tsx
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export default function DocumentsPage() {
  return (
    <ModulePlaceholder
      icon="file-up"
      title="ייבוא מסמכים"
      intro="העלאת מסמכים עסקיים; המערכת מזהה וקולטת נתונים למקומות הרלוונטיים — רק לאחר אישור. בעת ההעלאה בוחרים תחילה את סוג המסמך (אין העלאת קובץ סתם). הקבצים נשמרים מאובטח (Supabase Storage), גלויים למורשים בלבד."
      points={[
        "תמחיר עובדים (פעיל): קליטת שמות, תפקידים ועלות שעתית של כלל העובדים → טבלת employees; השלמה ידנית למה שחסר",
        "סוגי מסמכים נוספים: Z יומי מהקופה · רווח והפסד · מאזן בוחן · כרטסת ספקים · קניות חומרי גלם · מכירות תקופתי",
        "זרימה: נתח מסמך → טבלת תצוגה מקדימה (נתון · לאן ייכנס · ערך קיים · ערך חדש · סטטוס) → אשר קליטה",
        "Z יומי מעדכן רק נתוני יומן יבשים; אם קיים יום — השלם ריקים / החלף / בטל",
        "ניתוח הוצאות ויעדים: סעיף · בפועל · % מהמחזור · יעד · פער · סטטוס · המלצה",
        "המלצות AI לצמצום עלויות (ניהוליות בלבד — המשתמש מחליט)",
      ]}
    />
  );
}
```

### src/app/employees/page.tsx
```tsx
"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo, insert, update, remove } from "@/lib/repo";
import type { Employee, Shift } from "@/lib/domain/types";
import { DataState, EmptyState, Badge, Section, StatCard } from "@/components/ui";
import { Modal, Field } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { money, gregShort } from "@/lib/format";
import { WEEKDAYS } from "@/lib/hebrew";

const STATUSES = ["פעיל", "בהשהיה", "סיים"];
const ROLES = ["מנהל משמרת", "טבח", "פיצייה", "מלצר", "משלוחים", "קופה", "עזר מטבח"];

function weekDates(): string[] {
  const now = new Date();
  const sunday = new Date(now); sunday.setDate(now.getDate() - now.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday); d.setDate(sunday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export default function EmployeesPage() {
  const { data, loading, error, configured, reload } = useData(async () => {
    const [employees, shifts] = await Promise.all([repo.employees(), repo.shifts()]);
    return { employees, shifts };
  });
  const [editEmp, setEditEmp] = useState<Partial<Employee> | null>(null);
  const [addShift, setAddShift] = useState<string | null>(null); // date

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && (() => {
        const week = weekDates();
        const empById: Record<string, Employee> = {};
        data.employees.forEach((e) => (empById[e.id] = e));
        const weekShifts = data.shifts.filter((s) => week.includes(s.date));
        const totalHours = weekShifts.reduce((s, x) => s + (x.planned_hours ?? 0), 0);
        const totalCost = weekShifts.reduce((s, x) => {
          const emp = x.employee_id ? empById[x.employee_id] : null;
          const rate = (emp?.employer_cost ?? emp?.hourly_cost ?? 0);
          return s + rate * (x.planned_hours ?? 0);
        }, 0);

        return (
          <>
            <Section title="מצבת שבועית" action={<span className="chip">שבוע נוכחי</span>}>
              <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
                <StatCard label="סך שעות מתוכננות" value={`${totalHours}`} icon="clock" />
                <StatCard label="עלות שכר צפויה" value={money(totalCost)} icon="banknote" level={totalCost > 0 ? "warn" : undefined} />
                <StatCard label="עובדים פעילים" value={`${data.employees.filter((e) => e.status === "פעיל").length}`} icon="users" />
              </div>
              <div className="card table-scroll">
                <table className="data">
                  <thead><tr><th>יום</th><th>תאריך</th><th>משמרות</th><th>שעות</th><th></th></tr></thead>
                  <tbody>
                    {week.map((d, i) => {
                      const shifts = weekShifts.filter((s) => s.date === d);
                      const hrs = shifts.reduce((s, x) => s + (x.planned_hours ?? 0), 0);
                      return (
                        <tr key={d}>
                          <td className="font-semibold">{WEEKDAYS[i]}</td>
                          <td style={{ color: "var(--text-dim)" }}>{gregShort(d)}</td>
                          <td>
                            <div className="flex gap-1.5 flex-wrap">
                              {shifts.length === 0 && <span style={{ color: "var(--text-mute)" }}>—</span>}
                              {shifts.map((s) => (
                                <span key={s.id} className="chip" onClick={async () => { if (confirm("למחוק משמרת?")) { await remove("shifts", s.id); reload(); } }} style={{ cursor: "pointer" }}>
                                  {s.employee_id ? empById[s.employee_id]?.name ?? "?" : "לא שובץ"} · {s.shift_type ?? ""} {s.planned_hours ?? 0}ש׳
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>{hrs || "—"}</td>
                          <td><button className="btn btn-ghost btn-sm" onClick={() => setAddShift(d)}><Icon name="plus" size={14} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>

            <div className="flex justify-between items-center mb-3">
              <h2 className="font-extrabold">עובדים ({data.employees.length})</h2>
              <button className="btn" onClick={() => setEditEmp({ status: "פעיל" })}><Icon name="plus" size={17} /> עובד</button>
            </div>
            {data.employees.length === 0 ? (
              <EmptyState icon="users" title="אין עובדים עדיין" hint="הוסיפו עובד כדי לבנות סידור שבועי" />
            ) : (
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
                {data.employees.map((e) => (
                  <div key={e.id} className="card p-4 cursor-pointer" onClick={() => setEditEmp(e)}>
                    <div className="flex justify-between items-start">
                      <div className="font-bold">{e.name}</div>
                      <Badge level={e.status === "פעיל" ? "good" : e.status === "סיים" ? "bad" : "warn"}>{e.status}</Badge>
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>{e.role ?? "—"}</div>
                    {e.hourly_cost != null && <div className="text-xs mt-1">עלות שעתית: <b>{money(e.hourly_cost)}</b></div>}
                  </div>
                ))}
              </div>
            )}

            {editEmp && <EmployeeModal emp={editEmp} onClose={() => setEditEmp(null)} onSaved={() => { setEditEmp(null); reload(); }} />}
            {addShift && <ShiftModal date={addShift} employees={data.employees} onClose={() => setAddShift(null)} onSaved={() => { setAddShift(null); reload(); }} />}
          </>
        );
      })()}
    </DataState>
  );
}

function EmployeeModal({ emp, onClose, onSaved }: { emp: Partial<Employee>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Employee>>(emp);
  const set = (k: keyof Employee, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.name) return;
    const payload = {
      name: f.name, role: f.role ?? null,
      hourly_cost: f.hourly_cost == null || (f.hourly_cost as unknown) === "" ? null : Number(f.hourly_cost),
      employer_cost: f.employer_cost == null || (f.employer_cost as unknown) === "" ? null : Number(f.employer_cost),
      status: f.status ?? "פעיל",
      internal_rating: f.internal_rating == null || (f.internal_rating as unknown) === "" ? null : Number(f.internal_rating),
      notes: f.notes ?? null,
    };
    if (f.id) await update<Employee>("employees", f.id, payload);
    else await insert<Employee>("employees", payload);
    onSaved();
  }
  return (
    <Modal title={f.id ? "עריכת עובד" : "עובד חדש"} onClose={onClose}
      footer={<>
        <button className="btn" onClick={save} disabled={!f.name}><Icon name="check" size={16} /> שמירה</button>
        {f.id && <button className="btn btn-ghost" style={{ color: "var(--bad)" }} onClick={async () => { await remove("employees", f.id!); onSaved(); }}><Icon name="trash-2" size={16} /></button>}
      </>}>
      <div className="grid gap-3">
        <Field label="שם"><input className="field" value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="תפקיד"><select className="field" value={f.role ?? ""} onChange={(e) => set("role", e.target.value)}><option value="">—</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
          <Field label="סטטוס"><select className="field" value={f.status ?? "פעיל"} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="עלות שעתית (₪)"><input type="number" className="field" value={f.hourly_cost ?? ""} onChange={(e) => set("hourly_cost", e.target.value)} /></Field>
          <Field label="עלות מעסיק לשעה (₪)"><input type="number" className="field" value={f.employer_cost ?? ""} onChange={(e) => set("employer_cost", e.target.value)} /></Field>
        </div>
        <Field label="הערות"><input className="field" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function ShiftModal({ date, employees, onClose, onSaved }: { date: string; employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const [empId, setEmpId] = useState("");
  const [type, setType] = useState("ערב");
  const [hours, setHours] = useState("8");
  async function save() {
    await insert<Shift>("shifts", {
      date, shift_type: type, employee_id: empId || null,
      role: employees.find((e) => e.id === empId)?.role ?? null,
      planned_hours: Number(hours) || 0,
    });
    onSaved();
  }
  return (
    <Modal title={`הוספת משמרת · ${gregShort(date)}`} onClose={onClose}
      footer={<button className="btn" onClick={save}><Icon name="check" size={16} /> הוספה</button>}>
      <div className="grid gap-3">
        <Field label="עובד"><select className="field" value={empId} onChange={(e) => setEmpId(e.target.value)}><option value="">לא שובץ</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="משמרת"><select className="field" value={type} onChange={(e) => setType(e.target.value)}><option>בוקר</option><option>צהריים</option><option>ערב</option></select></Field>
          <Field label="שעות מתוכננות"><input type="number" className="field" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}
```

### src/app/food-cost/page.tsx
```tsx
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export default function FoodCostPage() {
  return (
    <ModulePlaceholder
      icon="receipt"
      title="ניתוח עלויות ופוד קוסט"
      intro="העלאת דוחות (רווח והפסד, מאזן בוחן, כרטסת ספקים, קניות חומרי גלם, דוחות מכירה) וניתוח אוטומטי לצמצום עלויות."
      points={[
        "אחוז חומרי גלם מהמחזור מול יעד (34%)",
        "זיהוי ספקים חריגים ועליות במחירי רכישה",
        "מנות עם פוד קוסט גבוה מדי",
        "פערים בין מכירות לקניות ובזבוז אפשרי",
        "המלצות התמקחות מול ספקים",
      ]}
    />
  );
}
```

### src/app/globals.css
```css
@import "tailwindcss";

/* ============================= Design tokens ============================= */
:root {
  --bg:        #f5f6f8;
  --surface:   #ffffff;
  --surface-2: #f9fafb;
  --border:    #e6e8ec;
  --text:      #111827;
  --text-dim:  #6b7280;
  --text-mute: #9ca3af;

  --brand:     #4f46e5;   /* indigo */
  --brand-2:   #6366f1;
  --good:      #16a34a;
  --good-bg:   #e7f6ec;
  --warn:      #d97706;
  --warn-bg:   #fdf2e2;
  --bad:       #dc2626;
  --bad-bg:    #fdeaea;
  --info:      #0891b2;

  --radius: 14px;
  --shadow-sm: 0 1px 2px rgba(16,24,40,.05);
  --shadow:    0 4px 16px rgba(16,24,40,.08);
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-border: var(--border);
  --color-brand: var(--brand);
  --color-good: var(--good);
  --color-warn: var(--warn);
  --color-bad: var(--bad);
  --font-sans: var(--font-heebo), "Segoe UI", system-ui, sans-serif;
}

* { box-sizing: border-box; }

html, body { padding: 0; margin: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-heebo), "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  min-height: 100dvh;
}

/* Reusable component classes (kept small; utilities do the rest) */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: var(--brand); color: #fff; font-weight: 700;
  border: none; border-radius: 10px; padding: 10px 16px; cursor: pointer;
  font-size: .92rem; transition: filter .15s, opacity .15s; white-space: nowrap;
}
.btn:hover { filter: brightness(1.07); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-ghost { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
.btn-ghost:hover { background: var(--surface-2); filter: none; }
.btn-sm { padding: 6px 12px; font-size: .82rem; }

.field {
  width: 100%; background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 10px 12px; font-size: .95rem; color: var(--text);
  outline: none; font-family: inherit;
}
.field:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(79,70,229,.12); }
.label { font-size: .8rem; color: var(--text-dim); font-weight: 600; margin-bottom: 5px; display: block; }

.chip {
  display: inline-flex; align-items: center; gap: 5px; font-size: .74rem; font-weight: 700;
  padding: 3px 9px; border-radius: 999px; background: var(--surface-2); color: var(--text-dim);
  border: 1px solid var(--border);
}
.chip-good { background: var(--good-bg); color: var(--good); border-color: transparent; }
.chip-warn { background: var(--warn-bg); color: var(--warn); border-color: transparent; }
.chip-bad  { background: var(--bad-bg);  color: var(--bad);  border-color: transparent; }
.chip-brand{ background: #eef0fe; color: var(--brand); border-color: transparent; }

/* number inputs: strip spinners for cleaner look */
input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input[type=number] { -moz-appearance: textfield; }

/* scrollable table container */
.table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
table.data { width: 100%; border-collapse: collapse; font-size: .88rem; white-space: nowrap; }
table.data th { text-align: start; color: var(--text-dim); font-weight: 600; font-size: .78rem; padding: 10px 12px; border-bottom: 1px solid var(--border); }
table.data td { padding: 11px 12px; border-bottom: 1px solid var(--border); }
table.data tr:last-child td { border-bottom: none; }
table.data tbody tr:hover { background: var(--surface-2); }

@keyframes pulse-bad { 50% { opacity: .55; } }
.animate-pulse-bad { animation: pulse-bad 1.2s ease-in-out infinite; }
```

### src/app/journal/page.tsx
```tsx
"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo } from "@/lib/repo";
import type { DailyEntry } from "@/lib/domain/types";
import { DataState, EmptyState, DrillBanner } from "@/components/ui";
import { JournalForm } from "@/components/JournalForm";
import { Icon } from "@/components/Icon";
import { money, gregDate, todayISO } from "@/lib/format";
import { useDrill } from "@/hooks/useDrill";

export default function JournalPage() {
  const { data, loading, error, configured, reload } = useData(async () => {
    const [entries, calendar] = await Promise.all([repo.dailyEntries(), repo.calendar()]);
    return { entries, calendar };
  });
  const [editing, setEditing] = useState<DailyEntry | null | undefined>(undefined); // undefined=closed
  const drill = useDrill();

  const applyFilter = (entries: DailyEntry[]) => {
    const t = todayISO();
    const ref = new Date(t);
    switch (drill.filter) {
      case "today": return entries.filter((e) => e.date === t);
      case "month": return entries.filter((e) => { const d = new Date(e.date); return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear(); });
      case "diff": return entries.filter((e) => Math.abs(e.revenue_difference ?? 0) > 0.5);
      case "deposit": return entries.filter((e) => (e.cash_to_deposit ?? 0) > 0);
      default: return entries;
    }
  };

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && (() => { const shown = applyFilter(data.entries); return (
        <>
          {editing !== undefined ? (
            <JournalForm
              calendar={data.calendar}
              initial={editing}
              onSaved={() => { setEditing(undefined); reload(); }}
              onCancel={() => setEditing(undefined)}
            />
          ) : (
            <>
              {editing === undefined && <DrillBanner label={drill.label} />}
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: "var(--text-dim)" }}>
                  {drill.filter ? `מסונן · ${shown.length} רשומות` : `${data.entries.length} ימים הוזנו · ימים ריקים לא נספרים בגרפים`}
                </div>
                <button className="btn" onClick={() => setEditing(null)}>
                  <Icon name="plus" size={17} /> הזנת יום
                </button>
              </div>
            </>
          )}

          {editing === undefined && (
            shown.length === 0 ? (
              <EmptyState icon="notebook-pen" title="אין ימים בתצוגה זו" hint="לחצו על ‘הזנת יום’ כדי להתחיל" />
            ) : (
              <div className="card table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>תאריך</th><th>יום</th><th>אירוע</th><th>מחזור</th><th>עסקאות</th>
                      <th>ממוצע</th><th>סה״כ תשלום</th><th>הפרש</th><th>להפקדה</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...shown].reverse().map((e) => (
                      <tr key={e.id} className="cursor-pointer" onClick={() => setEditing(e)}>
                        <td className="font-semibold">{gregDate(e.date)}</td>
                        <td style={{ color: "var(--text-dim)" }}>{e.weekday}</td>
                        <td style={{ color: "var(--text-dim)" }}>{e.event || "—"}</td>
                        <td className="font-bold">{e.revenue != null ? money(e.revenue) : "—"}</td>
                        <td>{e.transactions ?? "—"}</td>
                        <td>{e.avg_order != null ? money(e.avg_order) : "—"}</td>
                        <td>{money(e.total_payments)}</td>
                        <td style={{ color: Math.abs(e.revenue_difference ?? 0) > 0.5 ? "var(--bad)" : "var(--text-dim)" }}>
                          {money(e.revenue_difference)}
                        </td>
                        <td style={{ color: (e.cash_to_deposit ?? 0) > 0 ? "var(--warn)" : "var(--text-dim)" }}>
                          {money(e.cash_to_deposit)}
                        </td>
                        <td><Icon name="pencil" size={15} className="opacity-40" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )})()}
    </DataState>
  );
}
```

### src/app/layout.tsx
```tsx
import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "מערכת ניהול פרגו",
  description: "מערכת ניהול לפיצה פרגו – צור הדסה",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
```

### src/app/leads/page.tsx
```tsx
"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo, insert, update, remove } from "@/lib/repo";
import type { Lead, FunnelStage } from "@/lib/domain/types";
import { DataState, EmptyState, Badge, Section, DrillBanner } from "@/components/ui";
import { Modal, Field } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { useDrill } from "@/hooks/useDrill";

const STAGES: FunnelStage[] = ["אותר", "טעימה נשלחה", "שיחת מעקב", "הזמנה ראשונה", "לקוח קבוע"];
const CATEGORIES = ["בית ספר", "ישיבה", "עסק", "משרד", "מוסד"];
// Quarterly targets from the spec
const TARGETS: Record<FunnelStage, number> = { "אותר": 100, "טעימה נשלחה": 100, "שיחת מעקב": 50, "הזמנה ראשונה": 20, "לקוח קבוע": 10 };

export default function LeadsPage() {
  const { data, loading, error, configured, reload } = useData(() => repo.leads());
  const [edit, setEdit] = useState<Partial<Lead> | null>(null);
  const drill = useDrill();

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && (() => {
        // count reached-at-least-this-stage
        const idx = (s: string) => STAGES.indexOf(s as FunnelStage);
        const reached = (stage: FunnelStage) => data.filter((l) => idx(l.funnel_stage) >= idx(stage)).length;
        const shown = drill.filter === "הזמנה ראשונה" ? data.filter((l) => idx(l.funnel_stage) >= idx("הזמנה ראשונה"))
          : drill.filter === "לקוח קבוע" ? data.filter((l) => l.funnel_stage === "לקוח קבוע") : data;
        return (
          <>
            <DrillBanner label={drill.label} />
            <Section title="משפך לקוחות עסקיים (יעד רבעוני)">
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
                {STAGES.map((s) => {
                  const val = s === "אותר" ? data.length : reached(s);
                  const target = TARGETS[s];
                  const pct = Math.min(100, Math.round((val / target) * 100));
                  return (
                    <div key={s} className="card p-4">
                      <div className="text-xs font-semibold" style={{ color: "var(--text-dim)" }}>{s}</div>
                      <div className="text-2xl font-extrabold mt-0.5">{val}<span className="text-sm font-normal" style={{ color: "var(--text-mute)" }}> / {target}</span></div>
                      <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: "var(--surface-2)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--brand)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <div className="flex justify-between items-center mb-3">
              <h2 className="font-extrabold">{drill.filter && drill.filter !== "all" ? `מסונן: ${drill.filter} (${shown.length})` : `רשימת לקוחות (${data.length})`}</h2>
              <button className="btn" onClick={() => setEdit({ funnel_stage: "אותר", personal_letter_sent: false, first_order: false })}>
                <Icon name="plus" size={17} /> לקוח
              </button>
            </div>

            {shown.length === 0 ? (
              <EmptyState icon="target" title="אין לקוחות בתצוגה זו" hint="הוסיפו בית ספר, ישיבה, עסק או מוסד" />
            ) : (
              <div className="grid gap-2.5">
                {shown.map((l) => (
                  <div key={l.id} className="card p-4 flex items-center gap-3 cursor-pointer" onClick={() => setEdit(l)}>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{l.business_name}</div>
                      <div className="flex gap-1.5 flex-wrap mt-1">
                        <Badge level="brand">{l.funnel_stage}</Badge>
                        {l.category && <Badge>{l.category}</Badge>}
                        {l.contact_name && <Badge>{l.contact_name}</Badge>}
                        {l.personal_letter_sent && <Badge level="good">מכתב נשלח</Badge>}
                      </div>
                    </div>
                    <Icon name="pencil" size={15} className="opacity-40" />
                  </div>
                ))}
              </div>
            )}

            {edit && <LeadModal lead={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
          </>
        );
      })()}
    </DataState>
  );
}

function LeadModal({ lead, onClose, onSaved }: { lead: Partial<Lead>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Lead>>(lead);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Lead, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    if (!f.business_name) return;
    setSaving(true);
    const payload = {
      business_name: f.business_name, category: f.category ?? null, contact_name: f.contact_name ?? null,
      role: f.role ?? null, phone: f.phone ?? null, address: f.address ?? null, tasting_item: f.tasting_item ?? null,
      personal_letter_sent: !!f.personal_letter_sent, delivery_date: f.delivery_date || null,
      funnel_stage: f.funnel_stage ?? "אותר", followup_date: f.followup_date || null, first_order: !!f.first_order, notes: f.notes ?? null,
    };
    if (f.id) await update<Lead>("leads", f.id, payload);
    else await insert<Lead>("leads", payload);
    setSaving(false); onSaved();
  }

  return (
    <Modal title={f.id ? "עריכת לקוח" : "לקוח חדש"} onClose={onClose}
      footer={<>
        <button className="btn" onClick={save} disabled={saving || !f.business_name}><Icon name="check" size={16} /> שמירה</button>
        {f.id && <button className="btn btn-ghost" style={{ color: "var(--bad)" }} onClick={async () => { await remove("leads", f.id!); onSaved(); }}><Icon name="trash-2" size={16} /></button>}
      </>}>
      <div className="grid gap-3">
        <Field label="שם העסק / מוסד"><input className="field" value={f.business_name ?? ""} onChange={(e) => set("business_name", e.target.value)} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="קטגוריה"><select className="field" value={f.category ?? ""} onChange={(e) => set("category", e.target.value)}><option value="">—</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="שלב במשפך"><select className="field" value={f.funnel_stage ?? "אותר"} onChange={(e) => set("funnel_stage", e.target.value)}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="איש קשר"><input className="field" value={f.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} /></Field>
          <Field label="תפקיד"><input className="field" value={f.role ?? ""} onChange={(e) => set("role", e.target.value)} /></Field>
          <Field label="טלפון"><input className="field" value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="מנת טעימה"><input className="field" value={f.tasting_item ?? ""} onChange={(e) => set("tasting_item", e.target.value)} /></Field>
          <Field label="תאריך מסירה"><input type="date" className="field" value={f.delivery_date ?? ""} onChange={(e) => set("delivery_date", e.target.value)} /></Field>
          <Field label="שיחת מעקב"><input type="date" className="field" value={f.followup_date ?? ""} onChange={(e) => set("followup_date", e.target.value)} /></Field>
        </div>
        <Field label="כתובת"><input className="field" value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.personal_letter_sent} onChange={(e) => set("personal_letter_sent", e.target.checked)} /> צורף מכתב אישי</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.first_order} onChange={(e) => set("first_order", e.target.checked)} /> בוצעה הזמנה ראשונה</label>
        </div>
        <Field label="הערות"><input className="field" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
```

### src/app/menu/page.tsx
```tsx
"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo, insert, update, remove } from "@/lib/repo";
import type { MenuItem, MenuStatus } from "@/lib/domain/types";
import { DataState, EmptyState, Badge } from "@/components/ui";
import { Modal, Field } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { money } from "@/lib/format";

const STATUSES: MenuStatus[] = ["רעיון", "בבדיקה", "בפיילוט", "פעיל", "ירד"];
const CATEGORIES = ["פיצה", "דגים", "סלטים", "מאפים", "שתייה", "קינוחים", "אחר"];

export default function MenuPage() {
  const { data, loading, error, configured, reload } = useData(async () => {
    const [menu, settings] = await Promise.all([repo.menu(), repo.settings()]);
    return { menu, settings };
  });
  const [edit, setEdit] = useState<Partial<MenuItem> | null>(null);

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && (
        <>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm" style={{ color: "var(--text-dim)" }}>יעד פוד קוסט: {data.settings.food_cost_target}%</div>
            <button className="btn" onClick={() => setEdit({ status: "רעיון" })}><Icon name="plus" size={17} /> מנה</button>
          </div>

          {data.menu.length === 0 ? (
            <EmptyState icon="utensils" title="אין מנות עדיין" />
          ) : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
              {data.menu.map((mi) => {
                const fc = mi.food_cost_percent;
                const high = fc != null && fc > data.settings.food_cost_target;
                return (
                  <div key={mi.id} className="card p-4 cursor-pointer" onClick={() => setEdit(mi)}>
                    <div className="flex justify-between items-start">
                      <div className="font-bold">{mi.name}</div>
                      <Badge level={mi.status === "פעיל" ? "good" : mi.status === "ירד" ? "bad" : undefined}>{mi.status}</Badge>
                    </div>
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      {mi.category && <Badge>{mi.category}</Badge>}
                      {mi.campaign_fit && <Badge level="brand">{mi.campaign_fit}</Badge>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                      <Cell k="מחיר" v={mi.sale_price != null ? money(mi.sale_price) : "—"} />
                      <Cell k="עלות" v={mi.food_cost != null ? money(mi.food_cost) : "—"} />
                      <Cell k="פוד קוסט" v={fc != null ? `${fc}%` : "—"} level={fc == null ? undefined : high ? "bad" : "good"} />
                    </div>
                    {mi.gross_profit != null && (
                      <div className="text-xs mt-2" style={{ color: "var(--text-dim)" }}>רווח גולמי: <b>{money(mi.gross_profit)}</b></div>
                    )}
                    {high && <div className="text-xs mt-1" style={{ color: "var(--bad)" }}>⚠ פוד קוסט מעל היעד — דורש החלטה מפורשת</div>}
                  </div>
                );
              })}
            </div>
          )}

          {edit && <MenuModal item={edit} target={data.settings.food_cost_target} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
        </>
      )}
    </DataState>
  );
}

function Cell({ k, v, level }: { k: string; v: string; level?: "good" | "bad" }) {
  const c = level === "good" ? "var(--good)" : level === "bad" ? "var(--bad)" : "var(--text)";
  return (
    <div className="rounded-lg py-1.5" style={{ background: "var(--surface-2)" }}>
      <div className="text-[10px]" style={{ color: "var(--text-mute)" }}>{k}</div>
      <div className="font-bold text-sm" style={{ color: c }}>{v}</div>
    </div>
  );
}

function MenuModal({ item, target, onClose, onSaved }: { item: Partial<MenuItem>; target: number; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<MenuItem>>(item);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof MenuItem, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  const price = Number(f.sale_price) || 0, cost = Number(f.food_cost) || 0;
  const fcPct = price > 0 ? Math.round((cost / price) * 1000) / 10 : null;
  const high = fcPct != null && fcPct > target;

  async function save() {
    if (!f.name) return;
    setSaving(true);
    const payload = {
      name: f.name, category: f.category ?? null,
      sale_price: f.sale_price === undefined || f.sale_price === null || (f.sale_price as unknown) === "" ? null : Number(f.sale_price),
      food_cost: f.food_cost === undefined || f.food_cost === null || (f.food_cost as unknown) === "" ? null : Number(f.food_cost),
      prep_time: f.prep_time == null || (f.prep_time as unknown) === "" ? null : Number(f.prep_time),
      requires_equipment: !!f.requires_equipment, requires_training: !!f.requires_training,
      campaign_fit: f.campaign_fit ?? null, status: f.status ?? "רעיון", notes: f.notes ?? null,
    };
    if (f.id) await update<MenuItem>("menu_items", f.id, payload);
    else await insert<MenuItem>("menu_items", payload);
    setSaving(false); onSaved();
  }

  return (
    <Modal title={f.id ? "עריכת מנה" : "מנה חדשה"} onClose={onClose}
      footer={<>
        <button className="btn" onClick={save} disabled={saving || !f.name}><Icon name="check" size={16} /> שמירה</button>
        {f.id && <button className="btn btn-ghost" style={{ color: "var(--bad)" }} onClick={async () => { await remove("menu_items", f.id!); onSaved(); }}><Icon name="trash-2" size={16} /></button>}
      </>}>
      <div className="grid gap-3">
        <Field label="שם המנה"><input className="field" value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="קטגוריה"><select className="field" value={f.category ?? ""} onChange={(e) => set("category", e.target.value)}><option value="">—</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="סטטוס"><select className="field" value={f.status ?? "רעיון"} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="מחיר מכירה (₪)"><input type="number" className="field" value={f.sale_price ?? ""} onChange={(e) => set("sale_price", e.target.value)} /></Field>
          <Field label="עלות חומרי גלם (₪)"><input type="number" className="field" value={f.food_cost ?? ""} onChange={(e) => set("food_cost", e.target.value)} /></Field>
          <Field label="זמן הכנה (דק׳)"><input type="number" className="field" value={f.prep_time ?? ""} onChange={(e) => set("prep_time", e.target.value)} /></Field>
          <Field label="מתאים לקמפיין"><input className="field" value={f.campaign_fit ?? ""} onChange={(e) => set("campaign_fit", e.target.value)} /></Field>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: high ? "var(--bad-bg)" : "var(--surface-2)" }}>
          <div className="text-xs" style={{ color: "var(--text-mute)" }}>פוד קוסט מחושב</div>
          <div className="font-extrabold text-lg" style={{ color: high ? "var(--bad)" : "var(--good)" }}>{fcPct != null ? `${fcPct}%` : "—"}</div>
          {high && <div className="text-xs" style={{ color: "var(--bad)" }}>מעל היעד ({target}%) — נדרש אישור מפורש</div>}
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.requires_equipment} onChange={(e) => set("requires_equipment", e.target.checked)} /> דורש ציוד מיוחד</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.requires_training} onChange={(e) => set("requires_training", e.target.checked)} /> דורש הכשרת עובדים</label>
        </div>
        <Field label="הערות"><input className="field" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
```

### src/app/page.tsx
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

### src/app/reports/page.tsx
```tsx
"use client";

import { useData } from "@/hooks/useData";
import { repo } from "@/lib/repo";
import { monthMetrics } from "@/lib/domain/calc";
import type { DailyEntry } from "@/lib/domain/types";
import { DataState, Section, StatCard, EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { money, nf, gregShort } from "@/lib/format";
import { exportJournalXlsx } from "@/lib/export";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";

const BRAND = "#4f46e5";
const PALETTE = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#9333ea"];

export default function ReportsPage() {
  const { data, loading, error, configured } = useData(async () => {
    const [entries, settings, leads] = await Promise.all([repo.dailyEntries(), repo.settings(), repo.leads()]);
    return { entries, settings, leads };
  });

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && (() => {
        // only days WITH revenue (empty days excluded from charts, per spec)
        const withData = data.entries.filter((e) => (e.revenue ?? 0) > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
        if (withData.length === 0) return <EmptyState icon="bar-chart-3" title="אין נתונים לדוחות" hint="הזינו ימים ביומן העסקי" />;

        const m = monthMetrics(data.entries, data.settings);

        // daily revenue series
        const daily = withData.map((e) => ({ name: gregShort(e.date), מחזור: Math.round(e.revenue ?? 0) }));
        // cumulative vs target
        let acc = 0;
        const cumulative = withData.map((e) => { acc += e.revenue ?? 0; return { name: gregShort(e.date), מצטבר: Math.round(acc) }; });
        // revenue by weekday
        const byWeekday: Record<string, number> = {};
        withData.forEach((e) => { const w = e.weekday ?? "?"; byWeekday[w] = (byWeekday[w] ?? 0) + (e.revenue ?? 0); });
        const weekdayData = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]
          .filter((w) => byWeekday[w]).map((w) => ({ name: w, מחזור: Math.round(byWeekday[w]) }));
        // payment methods (sum)
        const pay = [
          { name: "מזומן", v: sum(withData, "cash_received") },
          { name: "אשראי", v: sum(withData, "credit_received") },
          { name: "תן ביס/סיבוס", v: sum(withData, "tenbis_sibus") },
          { name: "וולט/משלוחה", v: sum(withData, "wolt_mishloha") },
          { name: "אחר", v: sum(withData, "other_payment") },
        ].filter((p) => p.v > 0);
        // order types
        const orders = [
          { name: "משלוחים", v: sum(withData, "deliveries") },
          { name: "איסוף עצמי", v: sum(withData, "pickup") },
          { name: "ישיבה במקום", v: sum(withData, "dine_in") },
        ].filter((o) => o.v > 0);

        return (
          <>
            <div className="flex justify-end mb-4">
              <button className="btn btn-ghost" onClick={() => exportJournalXlsx(data.entries)}>
                <Icon name="download" size={16} /> ייצוא ל-Excel
              </button>
            </div>

            <Section title="סיכום החודש">
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
                <StatCard label="מחזור מצטבר" value={money(m.cumulative)} />
                <StatCard label="% מהיעד" value={`${Math.round(m.pctOfTarget * 100)}%`} level={m.pctOfTarget >= 1 ? "good" : m.pctOfTarget >= 0.85 ? "warn" : "bad"} />
                <StatCard label="ממוצע הזמנה" value={money(m.avgOrder)} />
                <StatCard label="ימים עם נתונים" value={`${m.daysWithData}/${m.daysInMonth}`} />
              </div>
            </Section>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="מחזור מצטבר מול יעד">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={cumulative} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                    <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BRAND} stopOpacity={0.3} /><stop offset="100%" stopColor={BRAND} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="name" reversed tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v) => `${Math.round(v / 1000)}k`} orientation="right" />
                    <Tooltip formatter={(v) => money(Number(v))} />
                    <ReferenceLine y={data.settings.monthly_target} stroke="#dc2626" strokeDasharray="4 4" label={{ value: "יעד", fontSize: 11, fill: "#dc2626" }} />
                    <Area type="monotone" dataKey="מצטבר" stroke={BRAND} strokeWidth={2.5} fill="url(#g1)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="מחזור יומי">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={daily} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="name" reversed tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v) => `${Math.round(v / 1000)}k`} orientation="right" />
                    <Tooltip formatter={(v) => money(Number(v))} />
                    <Bar dataKey="מחזור" fill={BRAND} radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="מחזור לפי יום בשבוע">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={weekdayData} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="name" reversed tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v) => `${Math.round(v / 1000)}k`} orientation="right" />
                    <Tooltip formatter={(v) => money(Number(v))} />
                    <Bar dataKey="מחזור" fill="#0891b2" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="grid grid-cols-2 gap-4">
                <ChartCard title="אמצעי תשלום">
                  {pay.length ? <Donut data={pay} /> : <NoData />}
                </ChartCard>
                <ChartCard title="סוגי הזמנות">
                  {orders.length ? <Donut data={orders} /> : <NoData />}
                </ChartCard>
              </div>
            </div>
          </>
        );
      })()}
    </DataState>
  );
}

function sum(arr: DailyEntry[], key: keyof DailyEntry) {
  return arr.reduce((s, e) => s + (Number(e[key]) || 0), 0);
}
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card p-4"><div className="font-bold mb-2 text-sm">{title}</div>{children}</div>;
}
function NoData() { return <div className="text-sm text-center py-10" style={{ color: "var(--text-mute)" }}>אין נתונים</div>; }
function Donut({ data }: { data: { name: string; v: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="v" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => nf(Number(v))} />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

### src/app/settings/page.tsx
```tsx
"use client";

import { useState, useEffect } from "react";
import { useData } from "@/hooks/useData";
import { repo, update } from "@/lib/repo";
import type { Settings } from "@/lib/domain/types";
import { DataState, Section } from "@/components/ui";
import { Field } from "@/components/Modal";
import { Icon } from "@/components/Icon";

export default function SettingsPage() {
  const { data, loading, error, configured, reload } = useData(() => repo.settings());
  const [f, setF] = useState<Partial<Settings>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (data) setF(data); }, [data]);
  const set = (k: keyof Settings, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    await update<Settings>("settings", "1", {
      business_name: f.business_name, location: f.location,
      monthly_target: Number(f.monthly_target), avg_order_target: Number(f.avg_order_target),
      food_cost_target: Number(f.food_cost_target), cash_deposit_alert: Number(f.cash_deposit_alert),
      partners: (typeof f.partners === "string" ? (f.partners as string).split(",").map((s) => s.trim()) : f.partners) as string[],
    });
    setSaved(true); setTimeout(() => setSaved(false), 1800); reload();
  }

  return (
    <DataState configured={configured} loading={loading} error={error}>
      <Section title="הגדרות מערכת">
        <div className="card p-5 grid gap-3 max-w-xl">
          <div className="grid grid-cols-2 gap-3">
            <Field label="שם העסק"><input className="field" value={f.business_name ?? ""} onChange={(e) => set("business_name", e.target.value)} /></Field>
            <Field label="מיקום"><input className="field" value={f.location ?? ""} onChange={(e) => set("location", e.target.value)} /></Field>
            <Field label="יעד מחזור חודשי (₪)"><input type="number" className="field" value={f.monthly_target ?? ""} onChange={(e) => set("monthly_target", e.target.value)} /></Field>
            <Field label="יעד ממוצע הזמנה (₪)"><input type="number" className="field" value={f.avg_order_target ?? ""} onChange={(e) => set("avg_order_target", e.target.value)} /></Field>
            <Field label="יעד פוד קוסט (%)"><input type="number" className="field" value={f.food_cost_target ?? ""} onChange={(e) => set("food_cost_target", e.target.value)} /></Field>
            <Field label="סף התראת הפקדה (₪)"><input type="number" className="field" value={f.cash_deposit_alert ?? ""} onChange={(e) => set("cash_deposit_alert", e.target.value)} /></Field>
          </div>
          <Field label="שותפים (מופרדים בפסיק)">
            <input className="field" value={Array.isArray(f.partners) ? f.partners.join(", ") : ((f.partners as unknown as string) ?? "")} onChange={(e) => set("partners", e.target.value)} />
          </Field>
          <div className="flex items-center gap-3 mt-2">
            <button className="btn" onClick={save}><Icon name="check" size={16} /> שמירה</button>
            {saved && <span className="text-sm" style={{ color: "var(--good)" }}>נשמר ✓</span>}
          </div>
        </div>
      </Section>

      <Section title="תפקידים (עתידי)">
        <div className="card p-4 text-sm" style={{ color: "var(--text-dim)" }}>
          מבנה ההרשאות מוכן בארכיטקטורה: <b>מנהל · שותפה · עובד · רואה חשבון</b>.
          בשלב זה אין אכיפת הרשאות — יתווסף כמודול נפרד ללא שינוי בליבת המערכת.
        </div>
      </Section>
    </DataState>
  );
}
```

### src/app/tasks/page.tsx
```tsx
"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo, insert, update, remove } from "@/lib/repo";
import type { Task, TaskStatus } from "@/lib/domain/types";
import { DataState, EmptyState, Badge, DrillBanner } from "@/components/ui";
import { Modal, Field } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { gregDate } from "@/lib/format";
import { useDrill } from "@/hooks/useDrill";
import { useEffect } from "react";

const STATUSES: TaskStatus[] = ["מתוכנן", "בתהליך", "בוצע", "תקוע"];
const CATEGORIES = ["שיווק", "תפריט", "תפעול", "כספים", "ספקים", "שירות", "עובדים", "כשרות", "מכירות", "אסטרטגיה"];
const PRIORITIES = ["גבוהה", "רגילה", "נמוכה"];

const statusLevel = (s: string) => (s === "בוצע" ? "good" : s === "תקוע" ? "bad" : s === "בתהליך" ? "warn" : undefined);

export default function TasksPage() {
  const { data, loading, error, configured, reload } = useData(() => repo.tasks());
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [filter, setFilter] = useState<string>("");
  const drill = useDrill();
  useEffect(() => {
    if (drill.filter === "open") setFilter("open");
    else if (drill.filter) setFilter(drill.filter);
  }, [drill.filter]);

  const tasks = (data ?? []).filter((t) =>
    !filter ? true : filter === "open" ? t.status !== "בוצע" : t.status === filter
  );

  return (
    <DataState configured={configured} loading={loading} error={error}>
      <DrillBanner label={drill.label} />
      <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          <FilterChip active={filter === ""} onClick={() => setFilter("")}>הכל</FilterChip>
          {STATUSES.map((s) => <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>{s}</FilterChip>)}
        </div>
        <button className="btn" onClick={() => setEdit({ status: "מתוכנן", priority: "רגילה" })}>
          <Icon name="plus" size={17} /> משימה
        </button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon="list-checks" title="אין משימות" hint="הוסיפו משימה חדשה" />
      ) : (
        <div className="grid gap-2.5">
          {tasks.map((t) => (
            <div key={t.id} className="card p-4 flex items-center gap-3">
              <button
                title="סמן כבוצע"
                onClick={async () => { await update<Task>("tasks", t.id, { status: t.status === "בוצע" ? "מתוכנן" : "בוצע" }); reload(); }}
                className="w-6 h-6 rounded-md grid place-items-center shrink-0"
                style={{ border: "2px solid var(--border)", background: t.status === "בוצע" ? "var(--good)" : "transparent", color: "#fff" }}
              >
                {t.status === "בוצע" && <Icon name="check" size={14} />}
              </button>
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setEdit(t)}>
                <div className="font-bold" style={{ textDecoration: t.status === "בוצע" ? "line-through" : "none", color: t.status === "בוצע" ? "var(--text-mute)" : "var(--text)" }}>
                  {t.title}
                </div>
                <div className="flex gap-1.5 flex-wrap mt-1">
                  <Badge level={statusLevel(t.status)}>{t.status}</Badge>
                  {t.category && <Badge>{t.category}</Badge>}
                  {t.owner && <Badge>👤 {t.owner}</Badge>}
                  {t.priority === "גבוהה" && <Badge level="bad">עדיפות גבוהה</Badge>}
                  {t.due_date && <Badge>יעד: {gregDate(t.due_date)}</Badge>}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEdit(t)}><Icon name="pencil" size={15} /></button>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <TaskModal task={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
      )}
    </DataState>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="chip" style={{ background: active ? "var(--brand)" : undefined, color: active ? "#fff" : undefined, borderColor: active ? "transparent" : undefined, cursor: "pointer" }}>
      {children}
    </button>
  );
}

function TaskModal({ task, onClose, onSaved }: { task: Partial<Task>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Task>>(task);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Task, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    if (!f.title) return;
    setSaving(true);
    const payload = {
      title: f.title, category: f.category ?? null, owner: f.owner ?? null,
      due_date: f.due_date || null, status: f.status ?? "מתוכנן", priority: f.priority ?? "רגילה", notes: f.notes ?? null,
    };
    if (f.id) await update<Task>("tasks", f.id, payload);
    else await insert<Task>("tasks", payload);
    setSaving(false); onSaved();
  }

  return (
    <Modal title={f.id ? "עריכת משימה" : "משימה חדשה"} onClose={onClose}
      footer={<>
        <button className="btn" onClick={save} disabled={saving || !f.title}><Icon name="check" size={16} /> שמירה</button>
        {f.id && <button className="btn btn-ghost" style={{ color: "var(--bad)" }} onClick={async () => { await remove("tasks", f.id!); onSaved(); }}><Icon name="trash-2" size={16} /> מחיקה</button>}
      </>}>
      <div className="grid gap-3">
        <Field label="שם המשימה"><input className="field" value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="תחום">
            <select className="field" value={f.category ?? ""} onChange={(e) => set("category", e.target.value)}>
              <option value="">—</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="אחראי"><input className="field" value={f.owner ?? ""} onChange={(e) => set("owner", e.target.value)} /></Field>
          <Field label="סטטוס">
            <select className="field" value={f.status ?? "מתוכנן"} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
          <Field label="עדיפות">
            <select className="field" value={f.priority ?? "רגילה"} onChange={(e) => set("priority", e.target.value)}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
        </div>
        <Field label="תאריך יעד"><input type="date" className="field" value={f.due_date ?? ""} onChange={(e) => set("due_date", e.target.value)} /></Field>
        <Field label="הערות"><input className="field" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
```

### src/app/z-report/page.tsx
```tsx
"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo } from "@/lib/repo";
import { nextBusinessEvent } from "@/lib/domain/calc";
import { DataState, Section } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { money, gregDate, todayISO } from "@/lib/format";
import type { DailyEntry } from "@/lib/domain/types";

function buildReport(e: DailyEntry | null, dateISO: string, extra: { event: string | null; openTasks: string[] }): string {
  const L = (k: string, v: string) => `${k}: ${v}`;
  const lines = [
    `דוח Z יומי – תמונת מצב פרגו`,
    `תאריך: ${gregDate(dateISO)}`,
    ``,
    L("מחזור יומי", e?.revenue != null ? money(e.revenue) : "לא הוזן"),
    L("מספר עסקאות", String(e?.transactions ?? "—")),
    L("ממוצע הזמנה", e?.avg_order != null ? money(e.avg_order) : "—"),
    ``,
    L("מזומן שהתקבל", money(e?.cash_received)),
    L("אשראי / קופה", money(e?.credit_received)),
    L("תן ביס / סיבוס", money(e?.tenbis_sibus)),
    L("וולט / משלוחה", money(e?.wolt_mishloha)),
    L("אחר", money(e?.other_payment)),
    L("סה״כ אמצעי תשלום", money(e?.total_payments)),
    L("הפרש מול מחזור", money(e?.revenue_difference)),
    L("מזומן שהופקד", money(e?.cash_deposited)),
    L("מזומן שצריך להפקיד", money(e?.cash_to_deposit)),
    ``,
    L("משלוחים", String(e?.deliveries ?? "—")),
    L("איסוף עצמי", String(e?.pickup ?? "—")),
    L("ישיבה במקום", String(e?.dine_in ?? "—")),
    ``,
    L("הערות חריגות", e?.notes || "אין"),
    L("אירוע עסקי קרוב", extra.event || "אין אירוע מיוחד בקרוב"),
    ``,
    `משימות פתוחות חשובות:`,
    ...(extra.openTasks.length ? extra.openTasks.map((t) => `• ${t}`) : ["• אין"]),
  ];
  return lines.join("\n");
}

export default function ZReportPage() {
  const [date, setDate] = useState(todayISO());
  const [emails, setEmails] = useState("");
  const [copied, setCopied] = useState(false);

  const { data, loading, error, configured } = useData(async () => {
    const [entries, calendar, tasks] = await Promise.all([repo.dailyEntries(), repo.calendar(), repo.tasks()]);
    return { entries, calendar, tasks };
  });

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && (() => {
        const entry = data.entries.find((e) => e.date === date) ?? null;
        const ev = nextBusinessEvent(data.calendar, date);
        const openTasks = data.tasks.filter((t) => t.status !== "בוצע" && (t.priority === "גבוהה" || t.status === "בתהליך")).map((t) => t.title).slice(0, 6);
        const report = buildReport(entry, date, { event: ev ? `${ev.event} (${ev.active ? "כעת" : `בעוד ${ev.daysUntil} ימים`})` : null, openTasks });

        async function copy() { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 1800); }
        const mailto = `mailto:${encodeURIComponent(emails)}?subject=${encodeURIComponent(`דוח Z יומי – פרגו – ${gregDate(date)}`)}&body=${encodeURIComponent(report)}`;

        return (
          <>
            <Section title="דוח Z יומי – תמונת מצב פרגו">
              <div className="card p-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">תאריך הדוח</label>
                  <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">שליחה למיילים (מופרדים בפסיק)</label>
                  <input className="field" placeholder="mordechai@…, ana@…, cpa@…" value={emails} onChange={(e) => setEmails(e.target.value)} style={{ direction: "ltr" }} />
                </div>
              </div>
            </Section>

            <div className="card p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="font-bold text-sm">תצוגה מקדימה</div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost btn-sm" onClick={copy}><Icon name="check" size={15} /> {copied ? "הועתק!" : "העתקה"}</button>
                  <a className="btn btn-sm" href={mailto}><Icon name="send" size={15} /> שליחה במייל</a>
                </div>
              </div>
              <pre className="text-sm p-3 rounded-lg whitespace-pre-wrap" style={{ background: "var(--surface-2)", lineHeight: 1.7 }}>{report}</pre>
              <p className="text-xs mt-3" style={{ color: "var(--text-mute)" }}>
                שליחה ידנית פעילה עכשיו. שליחה אוטומטית יומית בשעה קבועה תתווסף כמודול נפרד (אינטגרציית דיוור) בהמשך.
              </p>
            </div>
          </>
        );
      })()}
    </DataState>
  );
}
```

### src/components/AppShell.tsx
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV, MOBILE_PRIMARY } from "@/config/nav";
import { Icon } from "./Icon";
import { hebrewDate, weekdayHe } from "@/lib/hebrew";
import { gregDate, todayISO } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = NAV.find((n) => pathname.startsWith(n.href));
  const today = todayISO();
  const cloud = isSupabaseConfigured();

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-1">
      {NAV.map((n) => {
        const isActive = pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
            style={{
              background: isActive ? "var(--brand)" : "transparent",
              color: isActive ? "#fff" : "var(--text-dim)",
            }}
          >
            <Icon name={n.icon} size={19} />
            <span className="flex-1">{n.label}</span>
            {!n.ready && <span className="chip text-[10px] px-1.5 py-0">בקרוב</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh md:grid" style={{ gridTemplateColumns: "260px 1fr" }}>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col gap-5 p-4 border-e"
        style={{ borderColor: "var(--border)", background: "var(--surface)", position: "sticky", top: 0, height: "100dvh" }}
      >
        <Brand />
        <NavList />
        <div className="mt-auto text-xs" style={{ color: "var(--text-mute)" }}>
          מערכת ניהול פרגו · v1
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-col min-w-0">
        {/* Header */}
        <header
          className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 88%, transparent)", backdropFilter: "blur(8px)" }}
        >
          <button className="md:hidden btn-ghost btn btn-sm" onClick={() => setOpen(true)} aria-label="תפריט">
            <Icon name="menu" size={20} />
          </button>
          <div className="md:hidden font-extrabold text-lg">פרגו</div>
          <h1 className="hidden md:block text-xl font-extrabold">{active?.label ?? "דשבורד"}</h1>
          <span className="chip" style={{ background: cloud ? "var(--good-bg)" : "var(--surface-2)", color: cloud ? "var(--good)" : "var(--text-dim)", borderColor: "transparent" }}
            title={cloud ? "מחובר ל-Supabase בענן" : "נתונים נשמרים במכשיר זה. ניתן לשדרג לענן בהגדרות."}>
            {cloud ? "☁️ ענן" : "● מצב מקומי"}
          </span>
          <div className="ms-auto text-end leading-tight">
            <div className="text-sm font-bold">{weekdayHe(today)} · {gregDate(today)}</div>
            <div className="text-xs" style={{ color: "var(--text-dim)" }}>{hebrewDate(today)}</div>
          </div>
        </header>

        <main className="p-4 pb-24 md:pb-8 max-w-[1200px] w-full mx-auto">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5 border-t"
        style={{ borderColor: "var(--border)", background: "var(--surface)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV.filter((n) => MOBILE_PRIMARY.includes(n.href))
          .sort((a, b) => MOBILE_PRIMARY.indexOf(a.href) - MOBILE_PRIMARY.indexOf(b.href))
          .map((n) => {
            const isActive = pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className="flex flex-col items-center gap-1 py-2 text-[11px] font-semibold"
                style={{ color: isActive ? "var(--brand)" : "var(--text-mute)" }}>
                <Icon name={n.icon} size={21} />
                {n.label.split(" ")[0]}
              </Link>
            );
          })}
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.4)" }} />
          <div className="absolute inset-y-0 start-0 w-[280px] p-4 flex flex-col gap-5 shadow-xl"
            style={{ background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <Brand />
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}><Icon name="x" size={18} /></button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-10 h-10 rounded-xl grid place-items-center font-extrabold text-white text-lg"
        style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-2))" }}>
        פ
      </div>
      <div>
        <div className="font-extrabold leading-tight">מערכת ניהול פרגו</div>
        <div className="text-xs" style={{ color: "var(--text-dim)" }}>פיצה פרגו · צור הדסה</div>
      </div>
    </div>
  );
}
```

### src/components/Gauge.tsx
```tsx
"use client";

interface Zone { to: number; color: string } // `to` is a fraction 0..1

export function Gauge({
  value, max, label, display, zones,
}: {
  value: number; max: number; label: string; display: string;
  zones?: Zone[];
}) {
  const frac = max > 0 ? Math.max(0, Math.min(value / max, 1)) : 0;
  const cx = 100, cy = 100, r = 82;
  const angle = 180 - frac * 180;
  const polar = (deg: number): [number, number] => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
  };
  const z = zones ?? [
    { to: 0.5, color: "#dc2626" },
    { to: 0.8, color: "#d97706" },
    { to: 1, color: "#16a34a" },
  ];

  let prev = 0;
  const arcs = z.map((seg, i) => {
    const a0 = 180 - prev * 180;
    const a1 = 180 - seg.to * 180;
    const [x0, y0] = polar(a0);
    const [x1, y1] = polar(a1);
    prev = seg.to;
    return (
      <path key={i} d={`M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`}
        fill="none" stroke={seg.color} strokeWidth={13} strokeLinecap="round" opacity={0.9} />
    );
  });

  const [nx, ny] = polar(angle);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 6 200 116" className="w-full max-w-[300px]">
        <path d="M 18 100 A 82 82 0 0 1 182 100" fill="none" stroke="#eceef2" strokeWidth={13} strokeLinecap="round" />
        {arcs}
        <line x1={100} y1={100} x2={nx.toFixed(1)} y2={ny.toFixed(1)} stroke="#111827" strokeWidth={3.5} strokeLinecap="round" />
        <circle cx={100} cy={100} r={6.5} fill="#111827" />
        <circle cx={100} cy={100} r={2.6} fill="#fff" />
      </svg>
      <div className="text-3xl font-extrabold -mt-3">{display}</div>
      <div className="text-sm font-semibold" style={{ color: "var(--text-dim)" }}>{label}</div>
    </div>
  );
}
```

### src/components/Icon.tsx
```tsx
import {
  LayoutDashboard, NotebookPen, Banknote, CalendarDays, ListChecks, Target,
  Utensils, BarChart3, Users, Mail, Receipt, Sparkles, Settings, TrendingUp,
  TrendingDown, TriangleAlert, Calendar, CircleAlert, Check, Plus, Trash2,
  Pencil, X, ChevronLeft, Menu, LogOut, ArrowUp, ArrowDown, Send, Download,
  RefreshCw, Search, Phone, MapPin, Clock, FileUp, type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  "notebook-pen": NotebookPen,
  banknote: Banknote,
  "calendar-days": CalendarDays,
  "list-checks": ListChecks,
  target: Target,
  utensils: Utensils,
  "bar-chart-3": BarChart3,
  users: Users,
  mail: Mail,
  receipt: Receipt,
  sparkles: Sparkles,
  settings: Settings,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  "alert-triangle": TriangleAlert,
  calendar: Calendar,
  "circle-alert": CircleAlert,
  check: Check,
  plus: Plus,
  "trash-2": Trash2,
  pencil: Pencil,
  x: X,
  "chevron-left": ChevronLeft,
  menu: Menu,
  "log-out": LogOut,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  send: Send,
  download: Download,
  "refresh-cw": RefreshCw,
  search: Search,
  phone: Phone,
  "map-pin": MapPin,
  clock: Clock,
  "file-up": FileUp,
};

export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const C = MAP[name] ?? CircleAlert;
  return <C size={size} className={className} aria-hidden />;
}
```

### src/components/JournalForm.tsx
```tsx
"use client";

import { useMemo, useState } from "react";
import type { CalendarDay, DailyEntry } from "@/lib/domain/types";
import { hebrewDate, weekdayHe } from "@/lib/hebrew";
import { money } from "@/lib/format";
import { upsertDaily } from "@/lib/repo";
import { Icon } from "./Icon";

type NumKey =
  | "revenue" | "transactions" | "deliveries" | "pickup" | "dine_in"
  | "cash_received" | "credit_received" | "tenbis_sibus" | "wolt_mishloha"
  | "other_payment" | "cash_deposited";

const NUM_FIELDS: { key: NumKey; label: string; group: string }[] = [
  { key: "revenue", label: "מחזור יומי (₪)", group: "מכירות" },
  { key: "transactions", label: "מספר עסקאות", group: "מכירות" },
  { key: "deliveries", label: "משלוחים", group: "סוג הזמנה" },
  { key: "pickup", label: "איסוף עצמי", group: "סוג הזמנה" },
  { key: "dine_in", label: "ישיבה במקום", group: "סוג הזמנה" },
  { key: "cash_received", label: "מזומן שהתקבל", group: "אמצעי תשלום" },
  { key: "credit_received", label: "אשראי / קופה", group: "אמצעי תשלום" },
  { key: "tenbis_sibus", label: "תן ביס / סיבוס", group: "אמצעי תשלום" },
  { key: "wolt_mishloha", label: "וולט / משלוחה", group: "אמצעי תשלום" },
  { key: "other_payment", label: "אחר", group: "אמצעי תשלום" },
  { key: "cash_deposited", label: "מזומן שהופקד לבנק", group: "הפקדות" },
];

const GROUPS = ["מכירות", "סוג הזמנה", "אמצעי תשלום", "הפקדות"];

export function JournalForm({
  calendar, initial, onSaved, onCancel,
}: {
  calendar: CalendarDay[];
  initial?: DailyEntry | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const calByDate = useMemo(() => {
    const m: Record<string, CalendarDay> = {};
    calendar.forEach((c) => (m[c.date] = c));
    return m;
  }, [calendar]);

  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [event, setEvent] = useState(initial?.event ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    NUM_FIELDS.forEach((f) => (o[f.key] = initial?.[f.key] != null ? String(initial[f.key]) : ""));
    return o;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // auto-fill event from calendar when date changes (unless user typed one)
  const calEvent = calByDate[date]?.event_name ?? "";
  const effectiveEvent = event || calEvent;

  const n = (k: string) => parseFloat(vals[k] || "0") || 0;
  const totalPayments = n("cash_received") + n("credit_received") + n("tenbis_sibus") + n("wolt_mishloha") + n("other_payment");
  const revenueDiff = totalPayments - n("revenue");
  const cashToDeposit = n("cash_received") - n("cash_deposited");
  const avgOrder = n("transactions") > 0 ? n("revenue") / n("transactions") : 0;

  async function save() {
    setSaving(true); setErr(null);
    try {
      const row: Partial<DailyEntry> = {
        date,
        weekday: weekdayHe(date),
        hebrew_date: hebrewDate(date),
        event: effectiveEvent || null,
        notes: notes || null,
      };
      NUM_FIELDS.forEach((f) => {
        (row as Record<string, number | null>)[f.key] = vals[f.key] === "" ? null : n(f.key);
      });
      await upsertDaily(row);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-extrabold text-lg">{initial ? "עריכת יום" : "הזנת יום חדש"}</h2>
        {onCancel && <button className="btn btn-ghost btn-sm" onClick={onCancel}><Icon name="x" size={16} /></button>}
      </div>

      {/* date + auto fields */}
      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <div>
          <label className="label">תאריך</label>
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">אירוע / חג / תקופה</label>
          <input className="field" placeholder={calEvent || "ללא"} value={event} onChange={(e) => setEvent(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 flex-wrap mb-4 text-sm" style={{ color: "var(--text-dim)" }}>
        <span className="chip">{weekdayHe(date)}</span>
        <span className="chip">{hebrewDate(date)}</span>
        {calEvent && <span className="chip chip-brand">מהלוח: {calEvent}</span>}
      </div>

      {/* grouped number fields */}
      {GROUPS.map((g) => (
        <div key={g} className="mb-4">
          <div className="text-xs font-bold mb-2" style={{ color: "var(--text-dim)" }}>{g}</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            {NUM_FIELDS.filter((f) => f.group === g).map((f) => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input type="number" inputMode="decimal" className="field" value={vals[f.key]}
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} placeholder="0" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div>
        <label className="label">הערות חריגות</label>
        <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="למשל: צום, חג, אירוע מיוחד…" />
      </div>

      {/* live computed */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        <Computed k="ממוצע הזמנה" v={money(avgOrder)} />
        <Computed k="סה״כ אמצעי תשלום" v={money(totalPayments)} />
        <Computed k="הפרש מול מחזור" v={money(revenueDiff)} level={Math.abs(revenueDiff) > 0.5 ? "bad" : "good"} />
        <Computed k="מזומן להפקדה" v={money(cashToDeposit)} level={cashToDeposit > 0 ? "warn" : "good"} />
      </div>

      {err && <div className="text-sm mt-3" style={{ color: "var(--bad)" }}>{err}</div>}

      <div className="flex gap-2 mt-5">
        <button className="btn" onClick={save} disabled={saving}>
          <Icon name="check" size={17} /> {saving ? "שומר…" : "שמירה"}
        </button>
        {onCancel && <button className="btn btn-ghost" onClick={onCancel}>ביטול</button>}
      </div>
    </div>
  );
}

function Computed({ k, v, level }: { k: string; v: string; level?: "good" | "warn" | "bad" }) {
  const c = level === "good" ? "var(--good)" : level === "warn" ? "var(--warn)" : level === "bad" ? "var(--bad)" : "var(--brand)";
  return (
    <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--surface-2)" }}>
      <div className="text-[11px]" style={{ color: "var(--text-mute)" }}>{k}</div>
      <div className="font-extrabold" style={{ color: c }}>{v}</div>
    </div>
  );
}
```

### src/components/Modal.tsx
```tsx
"use client";

import { Icon } from "./Icon";

export function Modal({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(17,24,39,.45)" }} />
      <div
        className="relative w-full sm:max-w-lg card p-5 max-h-[92dvh] overflow-y-auto rounded-b-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-lg">{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        {children}
        {footer && <div className="flex gap-2 mt-5">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
```

### src/components/ModulePlaceholder.tsx
```tsx
import { Icon } from "./Icon";

export function ModulePlaceholder({ icon, title, intro, points }: {
  icon: string; title: string; intro: string; points: string[];
}) {
  return (
    <div className="card p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="grid place-items-center w-11 h-11 rounded-xl" style={{ background: "var(--surface-2)", color: "var(--brand)" }}>
          <Icon name={icon} size={22} />
        </div>
        <div>
          <div className="font-extrabold text-lg">{title}</div>
          <div className="chip chip-brand text-[11px]">מודול עתידי · הארכיטקטורה מוכנה</div>
        </div>
      </div>
      <p className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>{intro}</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2"><span style={{ color: "var(--brand)" }}>•</span>{p}</li>
        ))}
      </ul>
      <p className="text-xs mt-4" style={{ color: "var(--text-mute)" }}>
        מודול זה נבנה כיחידה נפרדת (integration/module) שתתחבר למערכת דרך שכבת הנתונים המשותפת,
        ללא שינוי במסכי הליבה — לפי סדר העדיפויות שהוגדר.
      </p>
    </div>
  );
}
```

### src/components/ui.tsx
```tsx
"use client";

import Link from "next/link";
import { Icon } from "./Icon";
import type { StatusLevel } from "@/lib/domain/calc";

// Drill-down banner shown at the top of a source screen when navigated from a
// dashboard metric. Shows "פירוט הנתון: X" + a back-to-dashboard button.
export function DrillBanner({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <div className="card p-3 mb-4 flex items-center justify-between gap-3" style={{ background: "#eef0fe", borderColor: "transparent" }}>
      <span className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--brand)" }}>
        <Icon name="search" size={16} /> פירוט הנתון: <b>{label}</b>
      </span>
      <Link href="/dashboard" className="btn btn-ghost btn-sm">← חזרה לדשבורד</Link>
    </div>
  );
}

export function Section({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h2 className="text-base font-extrabold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label, value, sub, level, icon, href,
}: { label: string; value: string; sub?: string; level?: StatusLevel; icon?: string; href?: string }) {
  const color = level === "good" ? "var(--good)" : level === "warn" ? "var(--warn)" : level === "bad" ? "var(--bad)" : "var(--text)";
  const body = (
    <div className="card p-4 h-full" style={href ? { cursor: "pointer" } : undefined}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold" style={{ color: "var(--text-dim)" }}>{label}</div>
        {icon && <Icon name={icon} size={16} className="opacity-40" />}
      </div>
      <div className="text-2xl font-extrabold mt-1" style={{ color }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "var(--text-mute)" }}>{sub}</div>}
      {href && <div className="text-[11px] font-bold mt-1" style={{ color: "var(--brand)" }}>לפירוט ›</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function Badge({ level, children }: { level?: StatusLevel | "brand"; children: React.ReactNode }) {
  const cls =
    level === "good" ? "chip chip-good" :
    level === "warn" ? "chip chip-warn" :
    level === "bad" ? "chip chip-bad" :
    level === "brand" ? "chip chip-brand" : "chip";
  return <span className={cls}>{children}</span>;
}

export function EmptyState({ icon = "search", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="card p-10 text-center">
      <div className="inline-grid place-items-center w-14 h-14 rounded-full mb-3" style={{ background: "var(--surface-2)" }}>
        <Icon name={icon} size={26} className="opacity-50" />
      </div>
      <div className="font-bold">{title}</div>
      {hint && <div className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>{hint}</div>}
    </div>
  );
}

export function Spinner({ label = "טוען…" }: { label?: string }) {
  return (
    <div className="card p-10 text-center" style={{ color: "var(--text-dim)" }}>
      <Icon name="refresh-cw" size={22} className="inline animate-spin opacity-60" />
      <div className="mt-2 text-sm">{label}</div>
    </div>
  );
}

// Wraps a screen body: shows setup notice / spinner / error / content.
export function DataState({
  configured, loading, error, children,
}: {
  configured: boolean; loading: boolean; error: string | null; children: React.ReactNode;
}) {
  if (!configured) return <SetupNotice />;
  if (loading) return <Spinner />;
  if (error) return (
    <div className="card p-6" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
      <div className="font-bold flex items-center gap-2"><Icon name="alert-triangle" size={18} /> שגיאה בטעינה</div>
      <div className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>{error}</div>
    </div>
  );
  return <>{children}</>;
}

export function SetupNotice() {
  return (
    <div className="card p-6 max-w-2xl">
      <div className="flex items-center gap-2 font-extrabold text-lg">
        <Icon name="settings" size={22} /> חיבור ל-Supabase נדרש
      </div>
      <p className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>
        המערכת מוכנה — נותר רק לחבר אותה למסד הנתונים שלך. שלושה צעדים:
      </p>
      <ol className="text-sm mt-3 space-y-2" style={{ color: "var(--text)" }}>
        <li>1. פתחו פרויקט חינמי ב־<b>supabase.com</b> (או השתמשו בקיים).</li>
        <li>2. הריצו את הקובץ <code className="chip">supabase/migrations/0001_init.sql</code> ואז <code className="chip">supabase/seed.sql</code> ב-SQL Editor.</li>
        <li>3. העתיקו את <b>Project URL</b> ו-<b>anon key</b> לקובץ <code className="chip">.env.local</code>:</li>
      </ol>
      <pre className="mt-3 p-3 rounded-lg text-xs overflow-x-auto" style={{ background: "var(--surface-2)", direction: "ltr" }}>
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...`}
      </pre>
      <p className="text-sm mt-3" style={{ color: "var(--text-dim)" }}>לאחר מכן הפעילו מחדש את השרת — והכל יעבוד עם הנתונים שלכם.</p>
    </div>
  );
}
```

### src/config/nav.ts
```ts
// Navigation model. `ready` screens are built; `soon` are future modules whose
// architecture exists (tables/registry) but UI is intentionally minimal.

export interface NavItem {
  href: string;
  label: string;
  icon: string; // lucide icon name
  ready: boolean;
  group: "core" | "future";
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "דשבורד", icon: "layout-dashboard", ready: true, group: "core" },
  { href: "/journal", label: "יומן יומי", icon: "notebook-pen", ready: true, group: "core" },
  { href: "/cashflow", label: "תזרים והפקדות", icon: "banknote", ready: true, group: "core" },
  { href: "/calendar", label: "לוח שנה עסקי", icon: "calendar-days", ready: true, group: "core" },
  { href: "/tasks", label: "משימות", icon: "list-checks", ready: true, group: "core" },
  { href: "/leads", label: "לקוחות פוטנציאליים", icon: "target", ready: true, group: "core" },
  { href: "/menu", label: "תפריט ומנות", icon: "utensils", ready: true, group: "core" },
  { href: "/reports", label: "דוחות", icon: "bar-chart-3", ready: true, group: "core" },
  { href: "/employees", label: "עובדים וסידור", icon: "users", ready: true, group: "future" },
  { href: "/z-report", label: "דוח Z יומי", icon: "mail", ready: true, group: "future" },
  { href: "/documents", label: "ייבוא מסמכים", icon: "file-up", ready: false, group: "future" },
  { href: "/food-cost", label: "פוד קוסט", icon: "receipt", ready: false, group: "future" },
  { href: "/ai", label: "המלצות AI", icon: "sparkles", ready: false, group: "future" },
  { href: "/settings", label: "הגדרות", icon: "settings", ready: true, group: "future" },
];

// Bottom-bar (mobile) shows the 5 most-used core screens.
export const MOBILE_PRIMARY = ["/dashboard", "/journal", "/cashflow", "/tasks", "/calendar"];
```

### src/hooks/useData.ts
```ts
"use client";

import { useCallback, useEffect, useState } from "react";

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  configured: boolean;
  reload: () => void;
}

// Loads data via an async loader, exposing loading/error/reload and whether
// Supabase is configured at all (drives the setup screen).
export function useData<T>(loader: () => Promise<T>, deps: unknown[] = []): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const configured = true; // local engine is always available; cloud is optional

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת נתונים");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps]);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, configured, reload: run };
}
```

### src/hooks/useDrill.ts
```ts
"use client";

import { useEffect, useState } from "react";

// Reads drill-down context from the URL (?filter=…&label=…) on the client.
// Uses window.location to avoid a Suspense boundary requirement at build time.
export function useDrill(): { filter: string | null; label: string | null } {
  const [state, setState] = useState<{ filter: string | null; label: string | null }>({ filter: null, label: null });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setState({ filter: q.get("filter"), label: q.get("label") });
  }, []);
  return state;
}
```

### src/lib/domain/calc.ts
```ts
// ============================================================================
// Pure business logic. No framework, no I/O — easy to test and reuse.
// All screens derive their numbers from here (single source principle).
// ============================================================================

import type { CalendarDay, DailyEntry, DishEvaluation, Settings, Task } from "./types";

const num = (n: number | null | undefined) => (Number.isFinite(n as number) ? (n as number) : 0);
const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

export interface MonthMetrics {
  monthLabel: string;
  daysInMonth: number;
  daysWithData: number;
  today: DailyEntry | null;
  todayRevenue: number;
  cumulative: number;
  target: number;
  pctOfTarget: number; // 0..1+
  avgDaily: number;
  pace: number; // projected month-end revenue
  pacePct: number;
  remaining: number; // target - cumulative
  daysLeft: number;
  neededPerDay: number; // to still hit target with remaining days
  transactions: number;
  avgOrder: number;
  deliveries: number;
  pickup: number;
  dineIn: number;
}

// entries: all daily_entries; refISO: "today" (defaults to real today)
export function monthMetrics(entries: DailyEntry[], settings: Settings, refISO?: string): MonthMetrics {
  const ref = refISO ? new Date(refISO + "T00:00:00") : new Date();
  const y = ref.getFullYear();
  const m0 = ref.getMonth();
  const dim = daysInMonth(y, m0);
  const refDay = ref.getDate();

  const monthEntries = entries.filter((e) => {
    const d = new Date(e.date + "T00:00:00");
    return d.getFullYear() === y && d.getMonth() === m0 && num(e.revenue) > 0;
  });

  const cumulative = monthEntries.reduce((s, e) => s + num(e.revenue), 0);
  const daysWithData = monthEntries.length;
  const avgDaily = daysWithData ? cumulative / daysWithData : 0;
  const pace = avgDaily * dim;
  const target = num(settings.monthly_target);
  const remaining = Math.max(0, target - cumulative);
  const daysLeft = Math.max(0, dim - refDay);
  const neededPerDay = daysLeft > 0 ? remaining / daysLeft : 0;

  const transactions = monthEntries.reduce((s, e) => s + num(e.transactions), 0);
  const avgOrder = transactions ? cumulative / transactions : 0;

  const todayISO = ref.toISOString().slice(0, 10);
  const today = entries.find((e) => e.date === todayISO) ?? null;

  const monthLabel = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(ref);

  return {
    monthLabel,
    daysInMonth: dim,
    daysWithData,
    today,
    todayRevenue: num(today?.revenue),
    cumulative,
    target,
    pctOfTarget: target ? cumulative / target : 0,
    avgDaily,
    pace,
    pacePct: target ? pace / target : 0,
    remaining,
    daysLeft,
    neededPerDay,
    transactions,
    avgOrder,
    deliveries: monthEntries.reduce((s, e) => s + num(e.deliveries), 0),
    pickup: monthEntries.reduce((s, e) => s + num(e.pickup), 0),
    dineIn: monthEntries.reduce((s, e) => s + num(e.dine_in), 0),
  };
}

export interface CashStatus {
  bankBalance: number;
  cashInRegister: number;
  openSupplierPayments: number;
  cashReceivedMonth: number;
  cashDepositedMonth: number;
  cashToDeposit: number;
  revenueDiff: number; // sum of daily revenue_difference this month
  depositWarn: boolean;
  diffAlert: boolean;
}

export function cashStatus(
  entries: DailyEntry[],
  snapshot: { bank_balance: number | null; cash_in_register: number | null; open_supplier_payments: number | null } | null,
  settings: Settings,
  refISO?: string
): CashStatus {
  const ref = refISO ? new Date(refISO + "T00:00:00") : new Date();
  const y = ref.getFullYear(), m0 = ref.getMonth();
  const monthEntries = entries.filter((e) => {
    const d = new Date(e.date + "T00:00:00");
    return d.getFullYear() === y && d.getMonth() === m0;
  });
  const cashReceivedMonth = monthEntries.reduce((s, e) => s + num(e.cash_received), 0);
  const cashDepositedMonth = monthEntries.reduce((s, e) => s + num(e.cash_deposited), 0);
  const cashToDeposit = cashReceivedMonth - cashDepositedMonth;
  const revenueDiff = monthEntries.reduce((s, e) => s + num(e.revenue_difference), 0);
  return {
    bankBalance: num(snapshot?.bank_balance),
    cashInRegister: num(snapshot?.cash_in_register),
    openSupplierPayments: num(snapshot?.open_supplier_payments),
    cashReceivedMonth,
    cashDepositedMonth,
    cashToDeposit,
    revenueDiff,
    depositWarn: cashToDeposit > num(settings.cash_deposit_alert),
    diffAlert: Math.abs(revenueDiff) > 0.5,
  };
}

export interface NextEvent {
  event: string;
  startISO: string;
  hebrew: string | null;
  importance: string | null;
  action: string | null;
  owner: string | null;
  daysUntil: number;
  active: boolean;
}

const MINOR_EVENTS = new Set(["יום שישי", "מוצאי שבת", ""]);

// Finds the nearest business event from today; null if none within `windowDays`.
export function nextBusinessEvent(
  calendar: CalendarDay[],
  refISO?: string,
  windowDays = 14
): NextEvent | null {
  const ref = refISO ? new Date(refISO + "T00:00:00") : new Date();
  ref.setHours(0, 0, 0, 0);

  // group consecutive same-event days into periods
  const rows = [...calendar]
    .filter((c) => c.event_name && !MINOR_EVENTS.has(c.event_name.trim()))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  interface P { event: string; start: string; end: string; c: CalendarDay; }
  const periods: P[] = [];
  for (const c of rows) {
    const ev = c.event_name!.trim();
    const last = periods[periods.length - 1];
    const prevDay = last ? new Date(last.end + "T00:00:00") : null;
    const thisDay = new Date(c.date + "T00:00:00");
    const consecutive = prevDay ? (thisDay.getTime() - prevDay.getTime()) / 86400000 <= 1 : false;
    if (last && last.event === ev && consecutive) {
      last.end = c.date;
    } else {
      periods.push({ event: ev, start: c.date, end: c.date, c });
    }
  }

  const refTime = ref.getTime();
  const candidates = periods
    .map((p) => {
      const start = new Date(p.start + "T00:00:00").getTime();
      const end = new Date(p.end + "T00:00:00").getTime();
      const active = start <= refTime && refTime <= end;
      const daysUntil = Math.round((start - refTime) / 86400000);
      return { p, active, daysUntil };
    })
    .filter((x) => x.active || x.daysUntil >= 0)
    .sort((a, b) => (a.active === b.active ? a.daysUntil - b.daysUntil : a.active ? -1 : 1));

  const chosen = candidates[0];
  if (!chosen) return null;
  if (!chosen.active && chosen.daysUntil > windowDays) return null;

  const c = chosen.p.c;
  return {
    event: chosen.p.event,
    startISO: chosen.p.start,
    hebrew: c.hebrew_date,
    importance: c.importance,
    action: c.recommended_action,
    owner: c.owner,
    daysUntil: Math.max(0, chosen.daysUntil),
    active: chosen.active,
  };
}

export interface TaskSummary {
  inProgress: number;
  stuck: number;
  planned: number;
  done: number;
  open: number;
  nearest: Task | null;
}

export function taskSummary(tasks: Task[], refISO?: string): TaskSummary {
  const open = tasks.filter((t) => t.status !== "בוצע");
  const withDue = open
    .filter((t) => t.due_date)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  const ref = refISO ?? new Date().toISOString().slice(0, 10);
  const nearest =
    withDue.find((t) => t.due_date! >= ref) ?? withDue[0] ?? open[0] ?? null;
  return {
    inProgress: tasks.filter((t) => t.status === "בתהליך").length,
    stuck: tasks.filter((t) => t.status === "תקוע").length,
    planned: tasks.filter((t) => t.status === "מתוכנן").length,
    done: tasks.filter((t) => t.status === "בוצע").length,
    open: open.length,
    nearest,
  };
}

export type StatusLevel = "good" | "warn" | "bad";

// Returns dashboard "warning lights" derived from all the metrics above.
export function warningLights(args: {
  metrics: MonthMetrics;
  cash: CashStatus;
  tasks: TaskSummary;
  nextEvent: NextEvent | null;
  settings: Settings;
}): { level: StatusLevel; title: string; detail: string; icon: string }[] {
  const { metrics, cash, tasks, nextEvent } = args;
  const lights: { level: StatusLevel; title: string; detail: string; icon: string }[] = [];

  // pace
  if (metrics.pacePct >= 1)
    lights.push({ level: "good", title: "מחזור בקצב היעד", detail: `צפי חודשי ${Math.round(metrics.pacePct * 100)}% מהיעד`, icon: "trending-up" });
  else if (metrics.pacePct >= 0.85)
    lights.push({ level: "warn", title: "מחזור מתחת לקצב", detail: `צפי ${Math.round(metrics.pacePct * 100)}% — צריך דחיפה קלה`, icon: "trending-down" });
  else
    lights.push({ level: "bad", title: "מחזור נמוך", detail: `צפי ${Math.round(metrics.pacePct * 100)}% מהיעד`, icon: "trending-down" });

  // deposits
  if (cash.depositWarn)
    lights.push({ level: "warn", title: "מזומן לא הופקד", detail: `${Math.round(cash.cashToDeposit).toLocaleString("he-IL")} ₪ ממתינים להפקדה`, icon: "banknote" });

  // payment reconciliation
  if (cash.diffAlert)
    lights.push({ level: "bad", title: "אי־התאמת אמצעי תשלום", detail: "סה״כ אמצעי תשלום שונה מהמחזור", icon: "alert-triangle" });

  // upcoming event
  if (nextEvent && nextEvent.active)
    lights.push({ level: "warn", title: "אירוע פעיל", detail: `${nextEvent.event} — בתקופה כעת`, icon: "calendar" });
  else if (nextEvent && nextEvent.daysUntil <= 7)
    lights.push({ level: "warn", title: "היערכות לאירוע", detail: `${nextEvent.event} בעוד ${nextEvent.daysUntil} ימים`, icon: "calendar" });

  // stuck tasks
  if (tasks.stuck > 0)
    lights.push({ level: "bad", title: "משימות תקועות", detail: `${tasks.stuck} משימות דורשות טיפול`, icon: "circle-alert" });

  if (lights.every((l) => l.level === "good"))
    lights.push({ level: "good", title: "הכל תקין", detail: "אין התראות פתוחות", icon: "check" });

  return lights;
}

// ============================================================================
// מודול "בדיקת מנה חדשה" — מנוע הכדאיות (טהור, ניתן לבדיקה).
// זהה ללוגיקה שרצה באפליקציה העצמאית; המסך המלא יתחבר לכאן.
// ============================================================================
export interface DishVerdict {
  laborCost: number;
  totalCost: number;
  minByFoodCost: number;
  recommendedPrice: number;
  price: number;
  foodCostPct: number;
  grossProfit: number;
  grossPct: number;
  netOverTotal: number;
  score: number; // 1..10
  color: StatusLevel; // good=green, warn=yellow, bad=red
  verdict: string;
  unitsToJustify: number | null;
  campaignFit: string[];
}

const roundPsych = (x: number) => {
  if (x <= 0) return 0;
  let b = Math.ceil(x / 10) * 10 - 1; // …49/59/69/79/89
  if (b < x) b += 10;
  return b;
};

export function evaluateDish(f: Partial<DishEvaluation>): DishVerdict {
  const food = num(f.food_cost);
  const labor = (num(f.prep_minutes) / 60) * num(f.hourly_labor_cost);
  const total = food + labor + num(f.packaging_cost) + num(f.other_costs);
  const tFc = num(f.target_food_cost) || 34;
  const mult = num(f.profit_multiplier) || 3;
  const minByFc = tFc > 0 ? food / (tFc / 100) : 0;
  const recommended = roundPsych(Math.max(minByFc, total * mult));
  const price = num(f.manual_price) > 0 ? num(f.manual_price) : recommended;
  const fcPct = price > 0 ? (food / price) * 100 : 0;
  const gross = price - food;
  const grossPct = price > 0 ? (gross / price) * 100 : 0;
  const net = price - total;

  let s = 5;
  if (fcPct <= tFc) s += 2; else if (fcPct > tFc + 5) s -= 2;
  if (grossPct >= 60) s += 1;
  if (grossPct < 40 && price > 0) s -= 1;
  if (net <= 0 && price > 0) s -= 2;
  if (f.new_ingredient) s -= 1;
  if (f.new_equipment) s -= 1;
  if (f.needs_training) s -= 0.5;
  if (f.complexity === "גבוהה") s -= 1;
  if (f.complexity === "נמוכה") s += 0.5;
  if (f.waste_risk === "גבוה") s -= 1.5; else if (f.waste_risk === "בינוני") s -= 0.5;
  if (f.can_prep_ahead) s += 0.5;
  s += Math.min(1.5, (f.solves?.length ?? 0) * 0.5) + Math.min(1, (f.timing?.length ?? 0) * 0.25);
  const score = Math.max(1, Math.min(10, Math.round(s)));

  let color: StatusLevel, verdict: string;
  if (score >= 7 && net > 0 && fcPct <= tFc + 4) { color = "good"; verdict = "מומלץ להכניס"; }
  else if (score >= 4 && net > 0) { color = "warn"; verdict = "להכניס רק לפיילוט"; }
  else { color = "bad"; verdict = "לא מומלץ כרגע"; }

  const justify = num(f.justify_target) || 1500;
  const campaignFit = [
    ...(f.timing ?? []).filter((t) => ["שישי", "מוצאי שבת", "חגים / תקופות מיוחדות"].includes(t)),
    ...(f.audience ?? []).filter((a) => ["בין המצרים", "סעודה רביעית"].includes(a)),
  ];
  return {
    laborCost: labor, totalCost: total, minByFoodCost: minByFc, recommendedPrice: recommended,
    price, foodCostPct: fcPct, grossProfit: gross, grossPct, netOverTotal: net,
    score, color, verdict, unitsToJustify: gross > 0 ? Math.ceil(justify / gross) : null,
    campaignFit: [...new Set(campaignFit)],
  };
}

// ============================================================================
// מודול "לוח משמרות שבועי" — חישוב מצב איוש למשמרת (טהור).
// filled/missing לכל תפקיד, סטטוס (full/partial/critical), ועלות משוערת.
// ============================================================================
export type ShiftFillKey = "full" | "partially_missing" | "critical_missing";
export interface ShiftFill {
  perRole: { role: string; required: number; approved: number; missing: number }[];
  totalMissing: number;
  status: ShiftFillKey;
  color: StatusLevel;
  estimatedCost: number;
}

const CRITICAL_ROLE = "cook"; // טבח = תפקיד קריטי

function hoursBetween(start?: string | null, end?: string | null): number {
  const p = (t?: string | null) => {
    if (!t) return 0;
    const [h, m] = t.split(":").map(Number);
    return h + (m || 0) / 60;
  };
  let d = p(end) - p(start);
  if (d < 0) d += 24;
  return d;
}

export function shiftFillStatus(
  shift: { start_time?: string | null; end_time?: string | null },
  requirements: { role: string; required_count: number }[],
  assignments: { role: string; employee_id: string }[],
  employees: { id: string; hourly_cost: number | null }[]
): ShiftFill {
  const empCost: Record<string, number> = {};
  employees.forEach((e) => (empCost[e.id] = num(e.hourly_cost)));
  const perRole = requirements
    .filter((r) => r.required_count > 0)
    .map((r) => {
      const approved = assignments.filter((a) => a.role === r.role).length;
      return { role: r.role, required: r.required_count, approved, missing: Math.max(0, r.required_count - approved) };
    });
  const totalMissing = perRole.reduce((s, r) => s + r.missing, 0);
  const critical = perRole.some((r) => r.role === CRITICAL_ROLE && r.missing > 0);
  const status: ShiftFillKey = totalMissing === 0 ? "full" : critical ? "critical_missing" : "partially_missing";
  const color: StatusLevel = status === "full" ? "good" : status === "critical_missing" ? "bad" : "warn";
  const hours = hoursBetween(shift.start_time, shift.end_time);
  const estimatedCost = assignments.reduce((s, a) => s + (empCost[a.employee_id] ?? 0) * hours, 0);
  return { perRole, totalMissing, status, color, estimatedCost };
}
```

### src/lib/domain/types.ts
```ts
// Domain types — mirror the Supabase schema (src/../supabase/migrations).

export interface Settings {
  id: number;
  business_name: string;
  location: string | null;
  monthly_target: number;
  avg_order_target: number;
  food_cost_target: number;
  cash_deposit_alert: number;
  partners: string[];
}

export interface DailyEntry {
  id: string;
  date: string; // YYYY-MM-DD
  hebrew_date: string | null;
  weekday: string | null;
  event: string | null;
  revenue: number | null;
  transactions: number | null;
  deliveries: number | null;
  pickup: number | null;
  dine_in: number | null;
  cash_received: number | null;
  credit_received: number | null;
  tenbis_sibus: number | null;
  wolt_mishloha: number | null;
  other_payment: number | null;
  cash_deposited: number | null;
  notes: string | null;
  // generated (read-only)
  avg_order: number | null;
  total_payments: number | null;
  revenue_difference: number | null;
  cash_to_deposit: number | null;
}

export interface CalendarDay {
  id: string;
  date: string;
  hebrew_date: string | null;
  weekday: string | null;
  event_name: string | null;
  importance: string | null;
  recommended_action: string | null;
  owner: string | null;
  status: string | null;
}

export type TaskStatus = "מתוכנן" | "בתהליך" | "בוצע" | "תקוע";
export interface Task {
  id: string;
  title: string;
  category: string | null;
  owner: string | null;
  due_date: string | null;
  status: TaskStatus;
  priority: string | null;
  notes: string | null;
}

export type FunnelStage = "אותר" | "טעימה נשלחה" | "שיחת מעקב" | "הזמנה ראשונה" | "לקוח קבוע";
export interface Lead {
  id: string;
  business_name: string;
  category: string | null;
  contact_name: string | null;
  role: string | null;
  phone: string | null;
  address: string | null;
  tasting_item: string | null;
  personal_letter_sent: boolean;
  delivery_date: string | null;
  funnel_stage: FunnelStage;
  followup_date: string | null;
  first_order: boolean;
  notes: string | null;
}

export type MenuStatus = "רעיון" | "בבדיקה" | "בפיילוט" | "פעיל" | "ירד";
export interface MenuItem {
  id: string;
  name: string;
  category: string | null;
  sale_price: number | null;
  food_cost: number | null;
  prep_time: number | null;
  requires_equipment: boolean;
  requires_training: boolean;
  campaign_fit: string | null;
  status: MenuStatus;
  notes: string | null;
  food_cost_percent: number | null;
  gross_profit: number | null;
}

export interface CashFlowSnapshot {
  id: string;
  date: string;
  bank_balance: number | null;
  cash_in_register: number | null;
  open_supplier_payments: number | null;
  notes: string | null;
}

export interface Employee {
  id: string;
  name: string;
  role: string | null;
  hourly_cost: number | null;
  employer_cost: number | null;
  weekly_availability: unknown;
  status: string;
  internal_rating: number | null;
  notes: string | null;
}

export interface Shift {
  id: string;
  date: string;
  shift_type: string | null;
  employee_id: string | null;
  role: string | null;
  planned_hours: number | null;
  notes: string | null;
}

// מודול "ייבוא מסמכים"
export type DocumentType =
  | "employee_costing" | "z_daily" | "profit_loss" | "trial_balance"
  | "suppliers_ledger" | "raw_material_purchases" | "sales_report";
export interface UploadedDocument {
  id: string;
  document_type: DocumentType;
  file_name: string | null;
  file_path: string | null;
  period_start: string | null;
  period_end: string | null;
  uploaded_by: string | null;
  uploaded_at?: string;
  status: "uploaded" | "parsed" | "approved" | "rejected";
  notes: string | null;
}
export interface DocumentExtractedData {
  id: string;
  document_id: string;
  field_name: string | null;
  extracted_value: string | null;
  target_table: string | null;
  target_field: string | null;
  existing_value: string | null;
  confidence_score: number | null;
  status: "pending" | "approved" | "rejected";
}
export interface ExpenseAnalysis {
  id: string;
  document_id: string | null;
  period_start: string | null;
  period_end: string | null;
  revenue: number | null;
  food_cost: number | null;
  labor_cost: number | null;
  rent: number | null;
  utilities: number | null;
  accounting: number | null;
  marketing: number | null;
  commissions: number | null;
  delivery_costs: number | null;
  other_expenses: number | null;
  operating_profit: number | null;
  net_profit: number | null;
}
export interface ExpenseRecommendation {
  id: string;
  analysis_id: string;
  category: string | null;
  severity: "green" | "yellow" | "red";
  recommendation: string | null;
}

// מודול "לוח משמרות שבועי"
export interface ShiftRequirement {
  id: string;
  shift_id: string;
  role: string;           // cook / waitress / hostess
  required_count: number;
}
export interface ShiftApplication {
  id: string;
  shift_id: string;
  employee_id: string;
  role: string;
  status: "pending" | "approved" | "rejected";
  created_at?: string;
}
export interface ShiftAssignment {
  id: string;
  shift_id: string;
  employee_id: string;
  role: string;
  approved_by: string | null;
  created_at?: string;
}

// מודול "בדיקת מנה חדשה"
export interface DishEvaluation {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  kind: string | null;
  food_cost: number | null;
  prep_minutes: number | null;
  hourly_labor_cost: number | null;
  packaging_cost: number | null;
  other_costs: number | null;
  manual_price: number | null;
  target_food_cost: number | null;
  profit_multiplier: number | null;
  justify_target: number | null;
  audience: string[] | null;
  timing: string[] | null;
  solves: string[] | null;
  new_ingredient: boolean;
  new_equipment: boolean;
  needs_training: boolean;
  can_prep_ahead: boolean;
  complexity: string | null;
  waste_risk: string | null;
  shelf_life: string | null;
  pilot: boolean;
  pilot_start: string | null;
  pilot_end: string | null;
  pilot_sales_target: number | null;
  pilot_gross_target: number | null;
  pilot_actual: number | null;
  decision: string | null;
  menu_item_id: string | null;
  // generated (read-only)
  labor_cost: number | null;
  total_cost: number | null;
  min_price_by_fc: number | null;
}
```

### src/lib/export.ts
```ts
"use client";

import * as XLSX from "xlsx";
import type { DailyEntry } from "./domain/types";

// Export the daily journal to a real .xlsx file (Hebrew headers).
export function exportJournalXlsx(entries: DailyEntry[]) {
  const rows = entries.map((e) => ({
    "תאריך": e.date,
    "יום": e.weekday ?? "",
    "תאריך עברי": e.hebrew_date ?? "",
    "אירוע": e.event ?? "",
    "מחזור": e.revenue ?? "",
    "עסקאות": e.transactions ?? "",
    "ממוצע הזמנה": e.avg_order ?? "",
    "משלוחים": e.deliveries ?? "",
    "איסוף עצמי": e.pickup ?? "",
    "ישיבה במקום": e.dine_in ?? "",
    "מזומן": e.cash_received ?? "",
    "אשראי/קופה": e.credit_received ?? "",
    "תן ביס/סיבוס": e.tenbis_sibus ?? "",
    "וולט/משלוחה": e.wolt_mishloha ?? "",
    "אחר": e.other_payment ?? "",
    "סה״כ אמצעי תשלום": e.total_payments ?? "",
    "הפרש מול מחזור": e.revenue_difference ?? "",
    "הופקד": e.cash_deposited ?? "",
    "מזומן להפקדה": e.cash_to_deposit ?? "",
    "הערות": e.notes ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "יומן עסקי");
  XLSX.writeFile(wb, `פרגו-יומן-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
```

### src/lib/format.ts
```ts
// Formatting helpers (Hebrew / ILS).

export const nf = (n: number | null | undefined, digits = 0) =>
  new Intl.NumberFormat("he-IL", { maximumFractionDigits: digits }).format(
    Number.isFinite(n as number) ? (n as number) : 0
  );

export const money = (n: number | null | undefined, digits = 0) => "₪" + nf(n, digits);

export const pct = (n: number | null | undefined) => `${Math.round((n ?? 0) * 100)}%`;

export const gregDate = (d: string | Date) =>
  new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    typeof d === "string" ? new Date(d) : d
  );

export const gregShort = (d: string | Date) =>
  new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit" }).format(
    typeof d === "string" ? new Date(d) : d
  );

export const todayISO = () => new Date().toISOString().slice(0, 10);
```

### src/lib/hebrew.ts
```ts
// Hebrew calendar helpers — computed locally via Intl (no dependency, offline).

const HE_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function weekdayHe(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00");
  return HE_WEEKDAYS[d.getDay()];
}

export function hebrewDate(dateISO: string): string {
  try {
    const d = new Date(dateISO + "T00:00:00");
    return new Intl.DateTimeFormat("he-u-ca-hebrew", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return "";
  }
}

export const WEEKDAYS = HE_WEEKDAYS;
```

### src/lib/integrations/registry.ts
```ts
// ============================================================================
// Integration registry — modular extension point.
//
// Future integrations (קופת אביב / POS, בנק, WhatsApp, דיוור) each register
// here as a SELF-CONTAINED module. Core screens never import an integration
// directly; they only read from this registry. Adding an integration = adding
// one file that calls registerIntegration(...) — no change to core code.
// ============================================================================

export type IntegrationKind = "pos" | "bank" | "messaging" | "mail" | "accounting";

export interface Integration {
  id: string;
  name: string;
  kind: IntegrationKind;
  description: string;
  /** Pull data INTO the system (e.g. daily Z from the POS). Optional. */
  importDaily?: (dateISO: string) => Promise<Partial<import("../domain/types").DailyEntry>>;
  /** Push data OUT (e.g. send the daily Z report by mail). Optional. */
  send?: (payload: unknown) => Promise<void>;
  enabled: boolean;
}

const registry = new Map<string, Integration>();

export function registerIntegration(i: Integration) {
  registry.set(i.id, i);
}

export function listIntegrations(): Integration[] {
  return [...registry.values()];
}

export function getIntegration(id: string): Integration | undefined {
  return registry.get(id);
}

// No integrations are registered yet — planned:
//   pos-aviv (import daily Z), bank-feed (deposits), mail-z-report, whatsapp.
```

### src/lib/local/localDb.ts
```ts
"use client";

// ============================================================================
// Local data engine — a Supabase-compatible adapter that persists to
// localStorage. Used automatically when no Supabase cloud is configured, so the
// app works instantly with zero setup. Same query surface as supabase-js, so
// switching to the cloud later requires no screen changes.
//
// Computed fields (avg_order, total_payments, ...) are calculated here, exactly
// mirroring the Postgres GENERATED columns — single-source principle preserved.
// ============================================================================

import { LOCAL_SEED } from "./seed";

const KEY = "pergo_local_v1";
type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function computed(table: string, r: Row): Row {
  if (table === "daily_entries") {
    const tp = num(r.cash_received) + num(r.credit_received) + num(r.tenbis_sibus) + num(r.wolt_mishloha) + num(r.other_payment);
    return {
      ...r,
      avg_order: num(r.transactions) > 0 ? Math.round((num(r.revenue) / num(r.transactions)) * 100) / 100 : null,
      total_payments: tp,
      revenue_difference: tp - num(r.revenue),
      cash_to_deposit: num(r.cash_received) - num(r.cash_deposited),
    };
  }
  if (table === "menu_items") {
    return {
      ...r,
      food_cost_percent: num(r.sale_price) > 0 ? Math.round((num(r.food_cost) / num(r.sale_price)) * 1000) / 10 : null,
      gross_profit: r.sale_price != null ? num(r.sale_price) - num(r.food_cost) : null,
    };
  }
  return r;
}

function load(): Store {
  if (typeof window === "undefined") return structuredClone(LOCAL_SEED) as Store;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {}
  const seeded = structuredClone(LOCAL_SEED) as Store;
  save(seeded);
  return seeded;
}
function save(store: Store) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(store)); } catch {}
}
const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? "id-" + Date.now() + "-" + Math.round(Math.random() * 1e6));

interface Result { data: unknown; error: null }

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: Row | null = null;
  private onConflict = "";
  private filters: [string, unknown][] = [];
  private orderCol = ""; private orderAsc = true;
  private _single = false;
  constructor(private table: string) {}

  select() { return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orderCol = col; this.orderAsc = opts?.ascending !== false; return this; }
  eq(col: string, val: unknown) { this.filters.push([col, val]); return this; }
  single() { this._single = true; return this; }
  insert(row: Row) { this.op = "insert"; this.payload = row; return this; }
  update(patch: Row) { this.op = "update"; this.payload = patch; return this; }
  upsert(row: Row, opts?: { onConflict?: string }) { this.op = "upsert"; this.payload = row; this.onConflict = opts?.onConflict ?? ""; return this; }
  delete() { this.op = "delete"; return this; }

  private match(r: Row) { return this.filters.every(([c, v]) => String(r[c]) === String(v)); }

  private resolve(): Result {
    const store = load();
    const rows = store[this.table] ?? (store[this.table] = []);

    if (this.op === "insert" || this.op === "upsert") {
      const row: Row = { ...this.payload };
      if (this.op === "upsert" && this.onConflict) {
        const i = rows.findIndex((r) => String(r[this.onConflict]) === String(row[this.onConflict]));
        if (i >= 0) { rows[i] = { ...rows[i], ...row, id: rows[i].id }; save(store); return { data: computed(this.table, rows[i]), error: null }; }
      }
      if (row.id == null) row.id = newId();
      rows.push(row); save(store);
      return { data: computed(this.table, row), error: null };
    }
    if (this.op === "update") {
      const i = rows.findIndex((r) => this.match(r));
      if (i >= 0) { rows[i] = { ...rows[i], ...this.payload }; save(store); return { data: computed(this.table, rows[i]), error: null }; }
      return { data: null, error: null };
    }
    if (this.op === "delete") {
      store[this.table] = rows.filter((r) => !this.match(r)); save(store);
      return { data: null, error: null };
    }
    // select
    let out = rows.filter((r) => this.match(r)).map((r) => computed(this.table, r));
    if (this.orderCol) {
      out = out.sort((a, b) => {
        const av = a[this.orderCol] as never, bv = b[this.orderCol] as never;
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * (this.orderAsc ? 1 : -1);
      });
    }
    return { data: this._single ? out[0] ?? null : out, error: null };
  }

  then<T = Result>(onf?: ((v: Result) => T | PromiseLike<T>) | null): PromiseLike<T> {
    return Promise.resolve(this.resolve()).then(onf ?? undefined) as PromiseLike<T>;
  }
}

export const localDb = {
  from(table: string) { return new Query(table); },
} as unknown;

// reset helper (used by settings "restore demo data")
export function resetLocalData() {
  if (typeof window !== "undefined") { window.localStorage.removeItem(KEY); load(); }
}
```

### src/lib/local/seed.ts  (נתוני זריעה — מקוצר)
```ts
// Auto-generated seed for local mode (from the Pergo workbook). Do not edit by hand.
export const LOCAL_SEED: Record<string, Record<string, unknown>[]> = {"settings": [{"id": 1, "business_name": "פרגו", "location": "צור הדסה", "monthly_target": 210000, "avg_order_target": 90, "food_cost_target": 34, "cash_deposit_alert": 5000, "partners": ["מרדכי", "אנה"]}], "daily_entries": [{"id": "de-2026-07-01", "date": "2026-07-01", "weekday": "רביעי", "hebrew_date": "ט״ז תמוז תשפ״ו", "event": null, "revenue": 10627.08, "transactions": 73, "deliveries": 8, "pickup": 9, "dine_in": 58, "cash_received": null, "credit_received": null, "tenbis_sibus": null, "wolt_mishloha": null, "other_payment": null, "cash_deposited": null, "notes": null}, {"id": "de-2026-07-02", "date": "2026-07-02", "weekday": "חמישי", "hebrew_date": "י״ז תמוז תשפ״ו", "event": "בין המצרים", "revenue": 7628.72, "transactions": 67, "deliveries": 11, "pickup": 2, "dine_in": 54, "cash_received": null, "credit_received": null, "tenbis_sibus": null, "wolt_mishloha": null, "other_payment": null, "cash_deposited": null, "notes": "צום יז' בתמוז"}, {"id": "de-2026-07-03", "date": "2026-07-03", "weekday": "שישי", "hebrew_date": "י״ח תמוז תשפ״ו", "event": "בין המצרים", "revenue": 1600.1, "transactions": 12, "deliveries": null, "pickup": 1, "dine_in": 16, "cash_received": null, "credit_received": null, "tenbis_sibus": null, "wolt_mishloha": null, "other_payment": null, "cash_deposited": null, "notes": "יום שישי"}, {"id": "de-2026-07-04", "date": "2026-07-04", "weekday": "שבת", "hebrew_date": "י״ט תמוז תשפ״ו", "event": "בין המצרים", "revenue": 1525.8, "transactions": 14, "deliveries": 2, "pickup": 1, "dine_in": 19, "cash_received": null, "credit_received": null, "tenbis_sibus": null, "wolt_mishloha": null, "other_payment": null, "cash_deposited": null, "notes": "מוצא\"ש"}], "business_calendar": [{"id": "cal-2026-07-01", "date": "2026-07-01", "weekday": "רביעי", "hebrew_date": "ט״ז תמוז תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-07-02", "date": "2026-07-02", "weekday": "חמישי", "hebrew_date": "י״ז תמוז תשפ״ו", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-03", "date": "2026-07-03", "weekday": "שישי", "hebrew_date": "י״ח תמוז תשפ״ו", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-04", "date": "2026-07-04", "weekday": "שבת", "hebrew_date": "י״ט תמוז תשפ״ו", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-05", "date": "2026-07-05", "weekday": "ראשון", "hebrew_date": "כ׳ תמוז תשפ״ו", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-06", "date": "2026-07-06", "weekday": "שני", "hebrew_date": "כ״א תמוז תשפ״ו", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-07", "date": "2026-07-07", "weekday": "שלישי", "hebrew_date": "כ״ב תמוז תשפ״ו", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-08", "date": "2026-07-08", "weekday": "רביעי", "hebrew_date": "כ״ג תמוז תשפ״ו", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-09", "date": "2026-07-09", "weekday": "חמישי", "hebrew_date": "כ״ד תמוז תשפ״ו", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-10", "date": "2026-07-10", "weekday": "שישי", "hebrew_date": "כ״ה תמוז תשפ״ו", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-11", "date": "2026-07-11", "weekday": "שבת", "hebrew_date": "כ״ו תמוז תשפ״ו", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-12", "date": "2026-07-12", "weekday": "ראשון", "hebrew_date": "כ״ז תמוז תשפ״ו", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-13", "date": "2026-07-13", "weekday": "שני", "hebrew_date": "כ״ח תמוז תשפ״ו", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-14", "date": "2026-07-14", "weekday": "שלישי", "hebrew_date": "כ״ט תמוז תשפ״ו", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-15", "date": "2026-07-15", "weekday": "רביעי", "hebrew_date": "א׳ אב תשפ״ו", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-16", "date": "2026-07-16", "weekday": "חמישי", "hebrew_date": "ב׳ אב תשפ״ו", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-17", "date": "2026-07-17", "weekday": "שישי", "hebrew_date": "ג׳ אב תשפ״ו", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-18", "date": "2026-07-18", "weekday": "שבת", "hebrew_date": "ד׳ אב תשפ״ו", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-19", "date": "2026-07-19", "weekday": "ראשון", "hebrew_date": "ה׳ אב תשפ״ו", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-20", "date": "2026-07-20", "weekday": "שני", "hebrew_date": "ו׳ אב תשפ״ו", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-21", "date": "2026-07-21", "weekday": "שלישי", "hebrew_date": "ז׳ אב תשפ״ו", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-22", "date": "2026-07-22", "weekday": "רביעי", "hebrew_date": "ח׳ אב תשפ״ו", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-23", "date": "2026-07-23", "weekday": "חמישי", "hebrew_date": "ט׳ אב תשפ״ו", "event_name": "תשעה באב", "importance": "מיוחד", "recommended_action": "בדיקת שעות פתיחה והיערכות למוצאי הצום", "owner": "אנה", "status": "פתוח"}, {"id": "cal-2026-07-24", "date": "2026-07-24", "weekday": "שישי", "hebrew_date": "י׳ אב תשפ״ו", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-25", "date": "2026-07-25", "weekday": "שבת", "hebrew_date": "י״א אב תשפ״ו", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-26", "date": "2026-07-26", "weekday": "ראשון", "hebrew_date": "י״ב אב תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-07-27", "date": "2026-07-27", "weekday": "שני", "hebrew_date": "י״ג אב תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-07-28", "date": "2026-07-28", "weekday": "שלישי", "hebrew_date": "י״ד אב תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-07-29", "date": "2026-07-29", "weekday": "רביעי", "hebrew_date": "ט״ו אב תשפ״ו", "event_name": "ט״ו באב", "importance": "גבוהה", "recommended_action": "קמפיין זוגות / ערב חלבי בוטיק", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-07-30", "date": "2026-07-30", "weekday": "חמישי", "hebrew_date": "ט״ז אב תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-07-31", "date": "2026-07-31", "weekday": "שישי", "hebrew_date": "י״ז אב תשפ״ו", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-08-01", "date": "2026-08-01", "weekday": "שבת", "hebrew_date": "י״ח אב תשפ״ו", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-08-02", "date": "2026-08-02", "weekday": "ראשון", "hebrew_date": "י״ט אב תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-03", "date": "2026-08-03", "weekday": "שני", "hebrew_date": "כ׳ אב תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-04", "date": "2026-08-04", "weekday": "שלישי", "hebrew_date": "כ״א אב תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-05", "date": "2026-08-05", "weekday": "רביעי", "hebrew_date": "כ״ב אב תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-06", "date": "2026-08-06", "weekday": "חמישי", "hebrew_date": "כ״ג אב תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-07", "date": "2026-08-07", "weekday": "שישי", "hebrew_date": "כ״ד אב תשפ״ו", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-08-08", "date": "2026-08-08", "weekday": "שבת", "hebrew_date": "כ״ה אב תשפ״ו", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-08-09", "date": "2026-08-09", "weekday": "ראשון", "hebrew_date": "כ״ו אב תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-10", "date": "2026-08-10", "weekday": "שני", "hebrew_date": "כ״ז אב תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-11", "date": "2026-08-11", "weekday": "שלישי", "hebrew_date": "כ״ח אב תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-12", "date": "2026-08-12", "weekday": "רביעי", "hebrew_date": "כ״ט אב תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-13", "date": "2026-08-13", "weekday": "חמישי", "hebrew_date": "ל׳ אב תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-14", "date": "2026-08-14", "weekday": "שישי", "hebrew_date": "א׳ אלול תשפ״ו", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-08-15", "date": "2026-08-15", "weekday": "שבת", "hebrew_date": "ב׳ אלול תשפ״ו", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-08-16", "date": "2026-08-16", "weekday": "ראשון", "hebrew_date": "ג׳ אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-17", "date": "2026-08-17", "weekday": "שני", "hebrew_date": "ד׳ אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-18", "date": "2026-08-18", "weekday": "שלישי", "hebrew_date": "ה׳ אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-19", "date": "2026-08-19", "weekday": "רביעי", "hebrew_date": "ו׳ אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-20", "date": "2026-08-20", "weekday": "חמישי", "hebrew_date": "ז׳ אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-21", "date": "2026-08-21", "weekday": "שישי", "hebrew_date": "ח׳ אלול תשפ״ו", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-08-22", "date": "2026-08-22", "weekday": "שבת", "hebrew_date": "ט׳ אלול תשפ״ו", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-08-23", "date": "2026-08-23", "weekday": "ראשון", "hebrew_date": "י׳ אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-24", "date": "2026-08-24", "weekday": "שני", "hebrew_date": "י״א אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-25", "date": "2026-08-25", "weekday": "שלישי", "hebrew_date": "י״ב אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-26", "date": "2026-08-26", "weekday": "רביעי", "hebrew_date": "י״ג אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-27", "date": "2026-08-27", "weekday": "חמישי", "hebrew_date": "י״ד אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-28", "date": "2026-08-28", "weekday": "שישי", "hebrew_date": "ט״ו אלול תשפ״ו", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-08-29", "date": "2026-08-29", "weekday": "שבת", "hebrew_date": "ט״ז אלול תשפ״ו", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-08-30", "date": "2026-08-30", "weekday": "ראשון", "hebrew_date": "י״ז אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-08-31", "date": "2026-08-31", "weekday": "שני", "hebrew_date": "י״ח אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-01", "date": "2026-09-01", "weekday": "שלישי", "hebrew_date": "י״ט אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-02", "date": "2026-09-02", "weekday": "רביעי", "hebrew_date": "כ׳ אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-03", "date": "2026-09-03", "weekday": "חמישי", "hebrew_date": "כ״א אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-04", "date": "2026-09-04", "weekday": "שישי", "hebrew_date": "כ״ב אלול תשפ״ו", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-09-05", "date": "2026-09-05", "weekday": "שבת", "hebrew_date": "כ״ג אלול תשפ״ו", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-09-06", "date": "2026-09-06", "weekday": "ראשון", "hebrew_date": "כ״ד אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-07", "date": "2026-09-07", "weekday": "שני", "hebrew_date": "כ״ה אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-08", "date": "2026-09-08", "weekday": "שלישי", "hebrew_date": "כ״ו אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-09", "date": "2026-09-09", "weekday": "רביעי", "hebrew_date": "כ״ז אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-10", "date": "2026-09-10", "weekday": "חמישי", "hebrew_date": "כ״ח אלול תשפ״ו", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-11", "date": "2026-09-11", "weekday": "שישי", "hebrew_date": "כ״ט אלול תשפ״ו", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-09-12", "date": "2026-09-12", "weekday": "שבת", "hebrew_date": "א׳ תשרי תשפ״ז", "event_name": "ראש השנה", "importance": "גבוהה", "recommended_action": "מגשי אירוח / הזמנות חג", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-09-13", "date": "2026-09-13", "weekday": "ראשון", "hebrew_date": "ב׳ תשרי תשפ״ז", "event_name": "ראש השנה", "importance": "גבוהה", "recommended_action": "מגשי אירוח / הזמנות חג", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-09-14", "date": "2026-09-14", "weekday": "שני", "hebrew_date": "ג׳ תשרי תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-15", "date": "2026-09-15", "weekday": "שלישי", "hebrew_date": "ד׳ תשרי תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-16", "date": "2026-09-16", "weekday": "רביעי", "hebrew_date": "ה׳ תשרי תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-17", "date": "2026-09-17", "weekday": "חמישי", "hebrew_date": "ו׳ תשרי תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-18", "date": "2026-09-18", "weekday": "שישי", "hebrew_date": "ז׳ תשרי תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-09-19", "date": "2026-09-19", "weekday": "שבת", "hebrew_date": "ח׳ תשרי תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-09-20", "date": "2026-09-20", "weekday": "ראשון", "hebrew_date": "ט׳ תשרי תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-21", "date": "2026-09-21", "weekday": "שני", "hebrew_date": "י׳ תשרי תשפ״ז", "event_name": "יום כיפור", "importance": "מיוחד", "recommended_action": "בדיקת שעות פתיחה והיערכות לפני/אחרי הצום", "owner": "אנה", "status": "פתוח"}, {"id": "cal-2026-09-22", "date": "2026-09-22", "weekday": "שלישי", "hebrew_date": "י״א תשרי תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-23", "date": "2026-09-23", "weekday": "רביעי", "hebrew_date": "י״ב תשרי תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-24", "date": "2026-09-24", "weekday": "חמישי", "hebrew_date": "י״ג תשרי תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-09-25", "date": "2026-09-25", "weekday": "שישי", "hebrew_date": "י״ד תשרי תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-09-26", "date": "2026-09-26", "weekday": "שבת", "hebrew_date": "ט״ו תשרי תשפ״ז", "event_name": "סוכות", "importance": "גבוהה", "recommended_action": "מנות משפחתיות / חופשת ילדים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-09-27", "date": "2026-09-27", "weekday": "ראשון", "hebrew_date": "ט״ז תשרי תשפ״ז", "event_name": "סוכות", "importance": "גבוהה", "recommended_action": "מנות משפחתיות / חופשת ילדים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-09-28", "date": "2026-09-28", "weekday": "שני", "hebrew_date": "י״ז תשרי תשפ״ז", "event_name": "סוכות", "importance": "גבוהה", "recommended_action": "מנות משפחתיות / חופשת ילדים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-09-29", "date": "2026-09-29", "weekday": "שלישי", "hebrew_date": "י״ח תשרי תשפ״ז", "event_name": "סוכות", "importance": "גבוהה", "recommended_action": "מנות משפחתיות / חופשת ילדים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-09-30", "date": "2026-09-30", "weekday": "רביעי", "hebrew_date": "י״ט תשרי תשפ״ז", "event_name": "סוכות", "importance": "גבוהה", "recommended_action": "מנות משפחתיות / חופשת ילדים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-10-01", "date": "2026-10-01", "weekday": "חמישי", "hebrew_date": "כ׳ תשרי תשפ״ז", "event_name": "סוכות", "importance": "גבוהה", "recommended_action": "מנות משפחתיות / חופשת ילדים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-10-02", "date": "2026-10-02", "weekday": "שישי", "hebrew_date": "כ״א תשרי תשפ״ז", "event_name": "סוכות", "importance": "גבוהה", "recommended_action": "מנות משפחתיות / חופשת ילדים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-10-03", "date": "2026-10-03", "weekday": "שבת", "hebrew_date": "כ״ב תשרי תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-10-04", "date": "2026-10-04", "weekday": "ראשון", "hebrew_date": "כ״ג תשרי תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-05", "date": "2026-10-05", "weekday": "שני", "hebrew_date": "כ״ד תשרי תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-06", "date": "2026-10-06", "weekday": "שלישי", "hebrew_date": "כ״ה תשרי תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-07", "date": "2026-10-07", "weekday": "רביעי", "hebrew_date": "כ״ו תשרי תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-08", "date": "2026-10-08", "weekday": "חמישי", "hebrew_date": "כ״ז תשרי תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-09", "date": "2026-10-09", "weekday": "שישי", "hebrew_date": "כ״ח תשרי תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-10-10", "date": "2026-10-10", "weekday": "שבת", "hebrew_date": "כ״ט תשרי תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-10-11", "date": "2026-10-11", "weekday": "ראשון", "hebrew_date": "ל׳ תשרי תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-12", "date": "2026-10-12", "weekday": "שני", "hebrew_date": "א׳ חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-13", "date": "2026-10-13", "weekday": "שלישי", "hebrew_date": "ב׳ חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-14", "date": "2026-10-14", "weekday": "רביעי", "hebrew_date": "ג׳ חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-15", "date": "2026-10-15", "weekday": "חמישי", "hebrew_date": "ד׳ חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-16", "date": "2026-10-16", "weekday": "שישי", "hebrew_date": "ה׳ חשוון תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-10-17", "date": "2026-10-17", "weekday": "שבת", "hebrew_date": "ו׳ חשוון תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-10-18", "date": "2026-10-18", "weekday": "ראשון", "hebrew_date": "ז׳ חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-19", "date": "2026-10-19", "weekday": "שני", "hebrew_date": "ח׳ חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-20", "date": "2026-10-20", "weekday": "שלישי", "hebrew_date": "ט׳ חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-21", "date": "2026-10-21", "weekday": "רביעי", "hebrew_date": "י׳ חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-22", "date": "2026-10-22", "weekday": "חמישי", "hebrew_date": "י״א חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-23", "date": "2026-10-23", "weekday": "שישי", "hebrew_date": "י״ב חשוון תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-10-24", "date": "2026-10-24", "weekday": "שבת", "hebrew_date": "י״ג חשוון תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-10-25", "date": "2026-10-25", "weekday": "ראשון", "hebrew_date": "י״ד חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-26", "date": "2026-10-26", "weekday": "שני", "hebrew_date": "ט״ו חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-27", "date": "2026-10-27", "weekday": "שלישי", "hebrew_date": "ט״ז חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-28", "date": "2026-10-28", "weekday": "רביעי", "hebrew_date": "י״ז חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-29", "date": "2026-10-29", "weekday": "חמישי", "hebrew_date": "י״ח חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-10-30", "date": "2026-10-30", "weekday": "שישי", "hebrew_date": "י״ט חשוון תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-10-31", "date": "2026-10-31", "weekday": "שבת", "hebrew_date": "כ׳ חשוון תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-11-01", "date": "2026-11-01", "weekday": "ראשון", "hebrew_date": "כ״א חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-02", "date": "2026-11-02", "weekday": "שני", "hebrew_date": "כ״ב חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-03", "date": "2026-11-03", "weekday": "שלישי", "hebrew_date": "כ״ג חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-04", "date": "2026-11-04", "weekday": "רביעי", "hebrew_date": "כ״ד חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-05", "date": "2026-11-05", "weekday": "חמישי", "hebrew_date": "כ״ה חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-06", "date": "2026-11-06", "weekday": "שישי", "hebrew_date": "כ״ו חשוון תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-11-07", "date": "2026-11-07", "weekday": "שבת", "hebrew_date": "כ״ז חשוון תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-11-08", "date": "2026-11-08", "weekday": "ראשון", "hebrew_date": "כ״ח חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-09", "date": "2026-11-09", "weekday": "שני", "hebrew_date": "כ״ט חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-10", "date": "2026-11-10", "weekday": "שלישי", "hebrew_date": "ל׳ חשוון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-11", "date": "2026-11-11", "weekday": "רביעי", "hebrew_date": "א׳ כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-12", "date": "2026-11-12", "weekday": "חמישי", "hebrew_date": "ב׳ כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-13", "date": "2026-11-13", "weekday": "שישי", "hebrew_date": "ג׳ כסלו תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-11-14", "date": "2026-11-14", "weekday": "שבת", "hebrew_date": "ד׳ כסלו תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-11-15", "date": "2026-11-15", "weekday": "ראשון", "hebrew_date": "ה׳ כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-16", "date": "2026-11-16", "weekday": "שני", "hebrew_date": "ו׳ כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-17", "date": "2026-11-17", "weekday": "שלישי", "hebrew_date": "ז׳ כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-18", "date": "2026-11-18", "weekday": "רביעי", "hebrew_date": "ח׳ כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-19", "date": "2026-11-19", "weekday": "חמישי", "hebrew_date": "ט׳ כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-20", "date": "2026-11-20", "weekday": "שישי", "hebrew_date": "י׳ כסלו תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-11-21", "date": "2026-11-21", "weekday": "שבת", "hebrew_date": "י״א כסלו תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-11-22", "date": "2026-11-22", "weekday": "ראשון", "hebrew_date": "י״ב כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-23", "date": "2026-11-23", "weekday": "שני", "hebrew_date": "י״ג כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-24", "date": "2026-11-24", "weekday": "שלישי", "hebrew_date": "י״ד כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-25", "date": "2026-11-25", "weekday": "רביעי", "hebrew_date": "ט״ו כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-26", "date": "2026-11-26", "weekday": "חמישי", "hebrew_date": "ט״ז כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-27", "date": "2026-11-27", "weekday": "שישי", "hebrew_date": "י״ז כסלו תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-11-28", "date": "2026-11-28", "weekday": "שבת", "hebrew_date": "י״ח כסלו תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-11-29", "date": "2026-11-29", "weekday": "ראשון", "hebrew_date": "י״ט כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-11-30", "date": "2026-11-30", "weekday": "שני", "hebrew_date": "כ׳ כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-01", "date": "2026-12-01", "weekday": "שלישי", "hebrew_date": "כ״א כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-02", "date": "2026-12-02", "weekday": "רביעי", "hebrew_date": "כ״ב כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-03", "date": "2026-12-03", "weekday": "חמישי", "hebrew_date": "כ״ג כסלו תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-04", "date": "2026-12-04", "weekday": "שישי", "hebrew_date": "כ״ד כסלו תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-12-05", "date": "2026-12-05", "weekday": "שבת", "hebrew_date": "כ״ה כסלו תשפ״ז", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-12-06", "date": "2026-12-06", "weekday": "ראשון", "hebrew_date": "כ״ו כסלו תשפ״ז", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-12-07", "date": "2026-12-07", "weekday": "שני", "hebrew_date": "כ״ז כסלו תשפ״ז", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-12-08", "date": "2026-12-08", "weekday": "שלישי", "hebrew_date": "כ״ח כסלו תשפ״ז", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-12-09", "date": "2026-12-09", "weekday": "רביעי", "hebrew_date": "כ״ט כסלו תשפ״ז", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-12-10", "date": "2026-12-10", "weekday": "חמישי", "hebrew_date": "ל׳ כסלו תשפ״ז", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-12-11", "date": "2026-12-11", "weekday": "שישי", "hebrew_date": "א׳ טבת תשפ״ז", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-12-12", "date": "2026-12-12", "weekday": "שבת", "hebrew_date": "ב׳ טבת תשפ״ז", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2026-12-13", "date": "2026-12-13", "weekday": "ראשון", "hebrew_date": "ג׳ טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-14", "date": "2026-12-14", "weekday": "שני", "hebrew_date": "ד׳ טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-15", "date": "2026-12-15", "weekday": "שלישי", "hebrew_date": "ה׳ טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-16", "date": "2026-12-16", "weekday": "רביעי", "hebrew_date": "ו׳ טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-17", "date": "2026-12-17", "weekday": "חמישי", "hebrew_date": "ז׳ טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-18", "date": "2026-12-18", "weekday": "שישי", "hebrew_date": "ח׳ טבת תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-12-19", "date": "2026-12-19", "weekday": "שבת", "hebrew_date": "ט׳ טבת תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-12-20", "date": "2026-12-20", "weekday": "ראשון", "hebrew_date": "י׳ טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-21", "date": "2026-12-21", "weekday": "שני", "hebrew_date": "י״א טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-22", "date": "2026-12-22", "weekday": "שלישי", "hebrew_date": "י״ב טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-23", "date": "2026-12-23", "weekday": "רביעי", "hebrew_date": "י״ג טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-24", "date": "2026-12-24", "weekday": "חמישי", "hebrew_date": "י״ד טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-25", "date": "2026-12-25", "weekday": "שישי", "hebrew_date": "ט״ו טבת תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-12-26", "date": "2026-12-26", "weekday": "שבת", "hebrew_date": "ט״ז טבת תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2026-12-27", "date": "2026-12-27", "weekday": "ראשון", "hebrew_date": "י״ז טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-28", "date": "2026-12-28", "weekday": "שני", "hebrew_date": "י״ח טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-29", "date": "2026-12-29", "weekday": "שלישי", "hebrew_date": "י״ט טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-30", "date": "2026-12-30", "weekday": "רביעי", "hebrew_date": "כ׳ טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2026-12-31", "date": "2026-12-31", "weekday": "חמישי", "hebrew_date": "כ״א טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-01", "date": "2027-01-01", "weekday": "שישי", "hebrew_date": "כ״ב טבת תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-01-02", "date": "2027-01-02", "weekday": "שבת", "hebrew_date": "כ״ג טבת תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-01-03", "date": "2027-01-03", "weekday": "ראשון", "hebrew_date": "כ״ד טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-04", "date": "2027-01-04", "weekday": "שני", "hebrew_date": "כ״ה טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-05", "date": "2027-01-05", "weekday": "שלישי", "hebrew_date": "כ״ו טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-06", "date": "2027-01-06", "weekday": "רביעי", "hebrew_date": "כ״ז טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-07", "date": "2027-01-07", "weekday": "חמישי", "hebrew_date": "כ״ח טבת תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-08", "date": "2027-01-08", "weekday": "שישי", "hebrew_date": "כ״ט טבת תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-01-09", "date": "2027-01-09", "weekday": "שבת", "hebrew_date": "א׳ שבט תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-01-10", "date": "2027-01-10", "weekday": "ראשון", "hebrew_date": "ב׳ שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-11", "date": "2027-01-11", "weekday": "שני", "hebrew_date": "ג׳ שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-12", "date": "2027-01-12", "weekday": "שלישי", "hebrew_date": "ד׳ שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-13", "date": "2027-01-13", "weekday": "רביעי", "hebrew_date": "ה׳ שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-14", "date": "2027-01-14", "weekday": "חמישי", "hebrew_date": "ו׳ שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-15", "date": "2027-01-15", "weekday": "שישי", "hebrew_date": "ז׳ שבט תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-01-16", "date": "2027-01-16", "weekday": "שבת", "hebrew_date": "ח׳ שבט תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-01-17", "date": "2027-01-17", "weekday": "ראשון", "hebrew_date": "ט׳ שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-18", "date": "2027-01-18", "weekday": "שני", "hebrew_date": "י׳ שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-19", "date": "2027-01-19", "weekday": "שלישי", "hebrew_date": "י״א שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-20", "date": "2027-01-20", "weekday": "רביעי", "hebrew_date": "י״ב שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-21", "date": "2027-01-21", "weekday": "חמישי", "hebrew_date": "י״ג שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-22", "date": "2027-01-22", "weekday": "שישי", "hebrew_date": "י״ד שבט תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-01-23", "date": "2027-01-23", "weekday": "שבת", "hebrew_date": "ט״ו שבט תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-01-24", "date": "2027-01-24", "weekday": "ראשון", "hebrew_date": "ט״ז שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-25", "date": "2027-01-25", "weekday": "שני", "hebrew_date": "י״ז שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-26", "date": "2027-01-26", "weekday": "שלישי", "hebrew_date": "י״ח שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-27", "date": "2027-01-27", "weekday": "רביעי", "hebrew_date": "י״ט שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-28", "date": "2027-01-28", "weekday": "חמישי", "hebrew_date": "כ׳ שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-01-29", "date": "2027-01-29", "weekday": "שישי", "hebrew_date": "כ״א שבט תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-01-30", "date": "2027-01-30", "weekday": "שבת", "hebrew_date": "כ״ב שבט תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-01-31", "date": "2027-01-31", "weekday": "ראשון", "hebrew_date": "כ״ג שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-01", "date": "2027-02-01", "weekday": "שני", "hebrew_date": "כ״ד שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-02", "date": "2027-02-02", "weekday": "שלישי", "hebrew_date": "כ״ה שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-03", "date": "2027-02-03", "weekday": "רביעי", "hebrew_date": "כ״ו שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-04", "date": "2027-02-04", "weekday": "חמישי", "hebrew_date": "כ״ז שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-05", "date": "2027-02-05", "weekday": "שישי", "hebrew_date": "כ״ח שבט תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-02-06", "date": "2027-02-06", "weekday": "שבת", "hebrew_date": "כ״ט שבט תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-02-07", "date": "2027-02-07", "weekday": "ראשון", "hebrew_date": "ל׳ שבט תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-08", "date": "2027-02-08", "weekday": "שני", "hebrew_date": "א׳ אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-09", "date": "2027-02-09", "weekday": "שלישי", "hebrew_date": "ב׳ אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-10", "date": "2027-02-10", "weekday": "רביעי", "hebrew_date": "ג׳ אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-11", "date": "2027-02-11", "weekday": "חמישי", "hebrew_date": "ד׳ אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-12", "date": "2027-02-12", "weekday": "שישי", "hebrew_date": "ה׳ אדר תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-02-13", "date": "2027-02-13", "weekday": "שבת", "hebrew_date": "ו׳ אדר תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-02-14", "date": "2027-02-14", "weekday": "ראשון", "hebrew_date": "ז׳ אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-15", "date": "2027-02-15", "weekday": "שני", "hebrew_date": "ח׳ אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-16", "date": "2027-02-16", "weekday": "שלישי", "hebrew_date": "ט׳ אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-17", "date": "2027-02-17", "weekday": "רביעי", "hebrew_date": "י׳ אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-18", "date": "2027-02-18", "weekday": "חמישי", "hebrew_date": "י״א אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-19", "date": "2027-02-19", "weekday": "שישי", "hebrew_date": "י״ב אדר תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-02-20", "date": "2027-02-20", "weekday": "שבת", "hebrew_date": "י״ג אדר תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-02-21", "date": "2027-02-21", "weekday": "ראשון", "hebrew_date": "י״ד אדר תשפ״ז", "event_name": "פורים", "importance": "גבוהה", "recommended_action": "משלוחי מנות / מגשי אירוח", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-02-22", "date": "2027-02-22", "weekday": "שני", "hebrew_date": "ט״ו אדר תשפ״ז", "event_name": "פורים", "importance": "גבוהה", "recommended_action": "משלוחי מנות / מגשי אירוח", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-02-23", "date": "2027-02-23", "weekday": "שלישי", "hebrew_date": "ט״ז אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-24", "date": "2027-02-24", "weekday": "רביעי", "hebrew_date": "י״ז אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-25", "date": "2027-02-25", "weekday": "חמישי", "hebrew_date": "י״ח אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-02-26", "date": "2027-02-26", "weekday": "שישי", "hebrew_date": "י״ט אדר תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-02-27", "date": "2027-02-27", "weekday": "שבת", "hebrew_date": "כ׳ אדר תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-02-28", "date": "2027-02-28", "weekday": "ראשון", "hebrew_date": "כ״א אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-01", "date": "2027-03-01", "weekday": "שני", "hebrew_date": "כ״ב אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-02", "date": "2027-03-02", "weekday": "שלישי", "hebrew_date": "כ״ג אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-03", "date": "2027-03-03", "weekday": "רביעי", "hebrew_date": "כ״ד אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-04", "date": "2027-03-04", "weekday": "חמישי", "hebrew_date": "כ״ה אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-05", "date": "2027-03-05", "weekday": "שישי", "hebrew_date": "כ״ו אדר תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-03-06", "date": "2027-03-06", "weekday": "שבת", "hebrew_date": "כ״ז אדר תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-03-07", "date": "2027-03-07", "weekday": "ראשון", "hebrew_date": "כ״ח אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-08", "date": "2027-03-08", "weekday": "שני", "hebrew_date": "כ״ט אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-09", "date": "2027-03-09", "weekday": "שלישי", "hebrew_date": "ל׳ אדר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-10", "date": "2027-03-10", "weekday": "רביעי", "hebrew_date": "א׳ אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-11", "date": "2027-03-11", "weekday": "חמישי", "hebrew_date": "ב׳ אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-12", "date": "2027-03-12", "weekday": "שישי", "hebrew_date": "ג׳ אדר ב׳ תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-03-13", "date": "2027-03-13", "weekday": "שבת", "hebrew_date": "ד׳ אדר ב׳ תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-03-14", "date": "2027-03-14", "weekday": "ראשון", "hebrew_date": "ה׳ אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-15", "date": "2027-03-15", "weekday": "שני", "hebrew_date": "ו׳ אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-16", "date": "2027-03-16", "weekday": "שלישי", "hebrew_date": "ז׳ אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-17", "date": "2027-03-17", "weekday": "רביעי", "hebrew_date": "ח׳ אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-18", "date": "2027-03-18", "weekday": "חמישי", "hebrew_date": "ט׳ אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-19", "date": "2027-03-19", "weekday": "שישי", "hebrew_date": "י׳ אדר ב׳ תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-03-20", "date": "2027-03-20", "weekday": "שבת", "hebrew_date": "י״א אדר ב׳ תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-03-21", "date": "2027-03-21", "weekday": "ראשון", "hebrew_date": "י״ב אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-22", "date": "2027-03-22", "weekday": "שני", "hebrew_date": "י״ג אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-23", "date": "2027-03-23", "weekday": "שלישי", "hebrew_date": "י״ד אדר ב׳ תשפ״ז", "event_name": "פורים", "importance": "גבוהה", "recommended_action": "משלוחי מנות / מגשי אירוח", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-03-24", "date": "2027-03-24", "weekday": "רביעי", "hebrew_date": "ט״ו אדר ב׳ תשפ״ז", "event_name": "פורים", "importance": "גבוהה", "recommended_action": "משלוחי מנות / מגשי אירוח", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-03-25", "date": "2027-03-25", "weekday": "חמישי", "hebrew_date": "ט״ז אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-26", "date": "2027-03-26", "weekday": "שישי", "hebrew_date": "י״ז אדר ב׳ תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-03-27", "date": "2027-03-27", "weekday": "שבת", "hebrew_date": "י״ח אדר ב׳ תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-03-28", "date": "2027-03-28", "weekday": "ראשון", "hebrew_date": "י״ט אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-29", "date": "2027-03-29", "weekday": "שני", "hebrew_date": "כ׳ אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-30", "date": "2027-03-30", "weekday": "שלישי", "hebrew_date": "כ״א אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-03-31", "date": "2027-03-31", "weekday": "רביעי", "hebrew_date": "כ״ב אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-01", "date": "2027-04-01", "weekday": "חמישי", "hebrew_date": "כ״ג אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-02", "date": "2027-04-02", "weekday": "שישי", "hebrew_date": "כ״ד אדר ב׳ תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-04-03", "date": "2027-04-03", "weekday": "שבת", "hebrew_date": "כ״ה אדר ב׳ תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-04-04", "date": "2027-04-04", "weekday": "ראשון", "hebrew_date": "כ״ו אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-05", "date": "2027-04-05", "weekday": "שני", "hebrew_date": "כ״ז אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-06", "date": "2027-04-06", "weekday": "שלישי", "hebrew_date": "כ״ח אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-07", "date": "2027-04-07", "weekday": "רביעי", "hebrew_date": "כ״ט אדר ב׳ תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-08", "date": "2027-04-08", "weekday": "חמישי", "hebrew_date": "א׳ ניסן תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-09", "date": "2027-04-09", "weekday": "שישי", "hebrew_date": "ב׳ ניסן תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-04-10", "date": "2027-04-10", "weekday": "שבת", "hebrew_date": "ג׳ ניסן תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-04-11", "date": "2027-04-11", "weekday": "ראשון", "hebrew_date": "ד׳ ניסן תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-12", "date": "2027-04-12", "weekday": "שני", "hebrew_date": "ה׳ ניסן תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-13", "date": "2027-04-13", "weekday": "שלישי", "hebrew_date": "ו׳ ניסן תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-14", "date": "2027-04-14", "weekday": "רביעי", "hebrew_date": "ז׳ ניסן תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-15", "date": "2027-04-15", "weekday": "חמישי", "hebrew_date": "ח׳ ניסן תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-16", "date": "2027-04-16", "weekday": "שישי", "hebrew_date": "ט׳ ניסן תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-04-17", "date": "2027-04-17", "weekday": "שבת", "hebrew_date": "י׳ ניסן תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-04-18", "date": "2027-04-18", "weekday": "ראשון", "hebrew_date": "י״א ניסן תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-19", "date": "2027-04-19", "weekday": "שני", "hebrew_date": "י״ב ניסן תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-20", "date": "2027-04-20", "weekday": "שלישי", "hebrew_date": "י״ג ניסן תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-04-21", "date": "2027-04-21", "weekday": "רביעי", "hebrew_date": "י״ד ניסן תשפ״ז", "event_name": "פסח", "importance": "מיוחד", "recommended_action": "בדיקת פעילות / כשרות / תפריט חג", "owner": "אנה", "status": "פתוח"}, {"id": "cal-2027-04-22", "date": "2027-04-22", "weekday": "חמישי", "hebrew_date": "ט״ו ניסן תשפ״ז", "event_name": "פסח", "importance": "מיוחד", "recommended_action": "בדיקת פעילות / כשרות / תפריט חג", "owner": "אנה", "status": "פתוח"}, {"id": "cal-2027-04-23", "date": "2027-04-23", "weekday": "שישי", "hebrew_date": "ט״ז ניסן תשפ״ז", "event_name": "פסח", "importance": "מיוחד", "recommended_action": "בדיקת פעילות / כשרות / תפריט חג", "owner": "אנה", "status": "פתוח"}, {"id": "cal-2027-04-24", "date": "2027-04-24", "weekday": "שבת", "hebrew_date": "י״ז ניסן תשפ״ז", "event_name": "פסח", "importance": "מיוחד", "recommended_action": "בדיקת פעילות / כשרות / תפריט חג", "owner": "אנה", "status": "פתוח"}, {"id": "cal-2027-04-25", "date": "2027-04-25", "weekday": "ראשון", "hebrew_date": "י״ח ניסן תשפ״ז", "event_name": "פסח", "importance": "מיוחד", "recommended_action": "בדיקת פעילות / כשרות / תפריט חג", "owner": "אנה", "status": "פתוח"}, {"id": "cal-2027-04-26", "date": "2027-04-26", "weekday": "שני", "hebrew_date": "י״ט ניסן תשפ״ז", "event_name": "פסח", "importance": "מיוחד", "recommended_action": "בדיקת פעילות / כשרות / תפריט חג", "owner": "אנה", "status": "פתוח"}, {"id": "cal-2027-04-27", "date": "2027-04-27", "weekday": "שלישי", "hebrew_date": "כ׳ ניסן תשפ״ז", "event_name": "פסח", "importance": "מיוחד", "recommended_action": "בדיקת פעילות / כשרות / תפריט חג", "owner": "אנה", "status": "פתוח"}, {"id": "cal-2027-04-28", "date": "2027-04-28", "weekday": "רביעי", "hebrew_date": "כ״א ניסן תשפ״ז", "event_name": "פסח", "importance": "מיוחד", "recommended_action": "בדיקת פעילות / כשרות / תפריט חג", "owner": "אנה", "status": "פתוח"}, {"id": "cal-2027-04-29", "date": "2027-04-29", "weekday": "חמישי", "hebrew_date": "כ״ב ניסן תשפ״ז", "event_name": "פסח", "importance": "מיוחד", "recommended_action": "בדיקת פעילות / כשרות / תפריט חג", "owner": "אנה", "status": "פתוח"}, {"id": "cal-2027-04-30", "date": "2027-04-30", "weekday": "שישי", "hebrew_date": "כ״ג ניסן תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-05-01", "date": "2027-05-01", "weekday": "שבת", "hebrew_date": "כ״ד ניסן תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-05-02", "date": "2027-05-02", "weekday": "ראשון", "hebrew_date": "כ״ה ניסן תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-03", "date": "2027-05-03", "weekday": "שני", "hebrew_date": "כ״ו ניסן תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-04", "date": "2027-05-04", "weekday": "שלישי", "hebrew_date": "כ״ז ניסן תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-05", "date": "2027-05-05", "weekday": "רביעי", "hebrew_date": "כ״ח ניסן תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-06", "date": "2027-05-06", "weekday": "חמישי", "hebrew_date": "כ״ט ניסן תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-07", "date": "2027-05-07", "weekday": "שישי", "hebrew_date": "ל׳ ניסן תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-05-08", "date": "2027-05-08", "weekday": "שבת", "hebrew_date": "א׳ אייר תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-05-09", "date": "2027-05-09", "weekday": "ראשון", "hebrew_date": "ב׳ אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-10", "date": "2027-05-10", "weekday": "שני", "hebrew_date": "ג׳ אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-11", "date": "2027-05-11", "weekday": "שלישי", "hebrew_date": "ד׳ אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-12", "date": "2027-05-12", "weekday": "רביעי", "hebrew_date": "ה׳ אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-13", "date": "2027-05-13", "weekday": "חמישי", "hebrew_date": "ו׳ אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-14", "date": "2027-05-14", "weekday": "שישי", "hebrew_date": "ז׳ אייר תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-05-15", "date": "2027-05-15", "weekday": "שבת", "hebrew_date": "ח׳ אייר תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-05-16", "date": "2027-05-16", "weekday": "ראשון", "hebrew_date": "ט׳ אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-17", "date": "2027-05-17", "weekday": "שני", "hebrew_date": "י׳ אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-18", "date": "2027-05-18", "weekday": "שלישי", "hebrew_date": "י״א אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-19", "date": "2027-05-19", "weekday": "רביעי", "hebrew_date": "י״ב אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-20", "date": "2027-05-20", "weekday": "חמישי", "hebrew_date": "י״ג אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-21", "date": "2027-05-21", "weekday": "שישי", "hebrew_date": "י״ד אייר תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-05-22", "date": "2027-05-22", "weekday": "שבת", "hebrew_date": "ט״ו אייר תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-05-23", "date": "2027-05-23", "weekday": "ראשון", "hebrew_date": "ט״ז אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-24", "date": "2027-05-24", "weekday": "שני", "hebrew_date": "י״ז אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-25", "date": "2027-05-25", "weekday": "שלישי", "hebrew_date": "י״ח אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-26", "date": "2027-05-26", "weekday": "רביעי", "hebrew_date": "י״ט אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-27", "date": "2027-05-27", "weekday": "חמישי", "hebrew_date": "כ׳ אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-28", "date": "2027-05-28", "weekday": "שישי", "hebrew_date": "כ״א אייר תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-05-29", "date": "2027-05-29", "weekday": "שבת", "hebrew_date": "כ״ב אייר תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-05-30", "date": "2027-05-30", "weekday": "ראשון", "hebrew_date": "כ״ג אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-05-31", "date": "2027-05-31", "weekday": "שני", "hebrew_date": "כ״ד אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-01", "date": "2027-06-01", "weekday": "שלישי", "hebrew_date": "כ״ה אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-02", "date": "2027-06-02", "weekday": "רביעי", "hebrew_date": "כ״ו אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-03", "date": "2027-06-03", "weekday": "חמישי", "hebrew_date": "כ״ז אייר תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-04", "date": "2027-06-04", "weekday": "שישי", "hebrew_date": "כ״ח אייר תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-06-05", "date": "2027-06-05", "weekday": "שבת", "hebrew_date": "כ״ט אייר תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-06-06", "date": "2027-06-06", "weekday": "ראשון", "hebrew_date": "א׳ סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-07", "date": "2027-06-07", "weekday": "שני", "hebrew_date": "ב׳ סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-08", "date": "2027-06-08", "weekday": "שלישי", "hebrew_date": "ג׳ סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-09", "date": "2027-06-09", "weekday": "רביעי", "hebrew_date": "ד׳ סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-10", "date": "2027-06-10", "weekday": "חמישי", "hebrew_date": "ה׳ סיון תשפ״ז", "event_name": "שבועות", "importance": "גבוהה מאוד", "recommended_action": "קמפיין חלבי מרכזי; הזמנות מראש", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-06-11", "date": "2027-06-11", "weekday": "שישי", "hebrew_date": "ו׳ סיון תשפ״ז", "event_name": "שבועות", "importance": "גבוהה מאוד", "recommended_action": "קמפיין חלבי מרכזי; הזמנות מראש", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-06-12", "date": "2027-06-12", "weekday": "שבת", "hebrew_date": "ז׳ סיון תשפ״ז", "event_name": "שבועות", "importance": "גבוהה מאוד", "recommended_action": "קמפיין חלבי מרכזי; הזמנות מראש", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-06-13", "date": "2027-06-13", "weekday": "ראשון", "hebrew_date": "ח׳ סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-14", "date": "2027-06-14", "weekday": "שני", "hebrew_date": "ט׳ סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-15", "date": "2027-06-15", "weekday": "שלישי", "hebrew_date": "י׳ סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-16", "date": "2027-06-16", "weekday": "רביעי", "hebrew_date": "י״א סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-17", "date": "2027-06-17", "weekday": "חמישי", "hebrew_date": "י״ב סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-18", "date": "2027-06-18", "weekday": "שישי", "hebrew_date": "י״ג סיון תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-06-19", "date": "2027-06-19", "weekday": "שבת", "hebrew_date": "י״ד סיון תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-06-20", "date": "2027-06-20", "weekday": "ראשון", "hebrew_date": "ט״ו סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-21", "date": "2027-06-21", "weekday": "שני", "hebrew_date": "ט״ז סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-22", "date": "2027-06-22", "weekday": "שלישי", "hebrew_date": "י״ז סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-23", "date": "2027-06-23", "weekday": "רביעי", "hebrew_date": "י״ח סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-24", "date": "2027-06-24", "weekday": "חמישי", "hebrew_date": "י״ט סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-25", "date": "2027-06-25", "weekday": "שישי", "hebrew_date": "כ׳ סיון תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-06-26", "date": "2027-06-26", "weekday": "שבת", "hebrew_date": "כ״א סיון תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-06-27", "date": "2027-06-27", "weekday": "ראשון", "hebrew_date": "כ״ב סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-28", "date": "2027-06-28", "weekday": "שני", "hebrew_date": "כ״ג סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-29", "date": "2027-06-29", "weekday": "שלישי", "hebrew_date": "כ״ד סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-06-30", "date": "2027-06-30", "weekday": "רביעי", "hebrew_date": "כ״ה סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-01", "date": "2027-07-01", "weekday": "חמישי", "hebrew_date": "כ״ו סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-02", "date": "2027-07-02", "weekday": "שישי", "hebrew_date": "כ״ז סיון תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-03", "date": "2027-07-03", "weekday": "שבת", "hebrew_date": "כ״ח סיון תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-04", "date": "2027-07-04", "weekday": "ראשון", "hebrew_date": "כ״ט סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-05", "date": "2027-07-05", "weekday": "שני", "hebrew_date": "ל׳ סיון תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-06", "date": "2027-07-06", "weekday": "שלישי", "hebrew_date": "א׳ תמוז תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-07", "date": "2027-07-07", "weekday": "רביעי", "hebrew_date": "ב׳ תמוז תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-08", "date": "2027-07-08", "weekday": "חמישי", "hebrew_date": "ג׳ תמוז תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-09", "date": "2027-07-09", "weekday": "שישי", "hebrew_date": "ד׳ תמוז תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-10", "date": "2027-07-10", "weekday": "שבת", "hebrew_date": "ה׳ תמוז תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-11", "date": "2027-07-11", "weekday": "ראשון", "hebrew_date": "ו׳ תמוז תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-12", "date": "2027-07-12", "weekday": "שני", "hebrew_date": "ז׳ תמוז תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-13", "date": "2027-07-13", "weekday": "שלישי", "hebrew_date": "ח׳ תמוז תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-14", "date": "2027-07-14", "weekday": "רביעי", "hebrew_date": "ט׳ תמוז תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-15", "date": "2027-07-15", "weekday": "חמישי", "hebrew_date": "י׳ תמוז תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-16", "date": "2027-07-16", "weekday": "שישי", "hebrew_date": "י״א תמוז תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-17", "date": "2027-07-17", "weekday": "שבת", "hebrew_date": "י״ב תמוז תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-18", "date": "2027-07-18", "weekday": "ראשון", "hebrew_date": "י״ג תמוז תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-19", "date": "2027-07-19", "weekday": "שני", "hebrew_date": "י״ד תמוז תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-20", "date": "2027-07-20", "weekday": "שלישי", "hebrew_date": "ט״ו תמוז תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-21", "date": "2027-07-21", "weekday": "רביעי", "hebrew_date": "ט״ז תמוז תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-07-22", "date": "2027-07-22", "weekday": "חמישי", "hebrew_date": "י״ז תמוז תשפ״ז", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-23", "date": "2027-07-23", "weekday": "שישי", "hebrew_date": "י״ח תמוז תשפ״ז", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-24", "date": "2027-07-24", "weekday": "שבת", "hebrew_date": "י״ט תמוז תשפ״ז", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-25", "date": "2027-07-25", "weekday": "ראשון", "hebrew_date": "כ׳ תמוז תשפ״ז", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-26", "date": "2027-07-26", "weekday": "שני", "hebrew_date": "כ״א תמוז תשפ״ז", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-27", "date": "2027-07-27", "weekday": "שלישי", "hebrew_date": "כ״ב תמוז תשפ״ז", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-28", "date": "2027-07-28", "weekday": "רביעי", "hebrew_date": "כ״ג תמוז תשפ״ז", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-29", "date": "2027-07-29", "weekday": "חמישי", "hebrew_date": "כ״ד תמוז תשפ״ז", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-30", "date": "2027-07-30", "weekday": "שישי", "hebrew_date": "כ״ה תמוז תשפ״ז", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-07-31", "date": "2027-07-31", "weekday": "שבת", "hebrew_date": "כ״ו תמוז תשפ״ז", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-01", "date": "2027-08-01", "weekday": "ראשון", "hebrew_date": "כ״ז תמוז תשפ״ז", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-02", "date": "2027-08-02", "weekday": "שני", "hebrew_date": "כ״ח תמוז תשפ״ז", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-03", "date": "2027-08-03", "weekday": "שלישי", "hebrew_date": "כ״ט תמוז תשפ״ז", "event_name": "בין המצרים", "importance": "גבוהה", "recommended_action": "דגש חלבי ודגים; לפרסם סלמון", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-04", "date": "2027-08-04", "weekday": "רביעי", "hebrew_date": "א׳ אב תשפ״ז", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-05", "date": "2027-08-05", "weekday": "חמישי", "hebrew_date": "ב׳ אב תשפ״ז", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-06", "date": "2027-08-06", "weekday": "שישי", "hebrew_date": "ג׳ אב תשפ״ז", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-07", "date": "2027-08-07", "weekday": "שבת", "hebrew_date": "ד׳ אב תשפ״ז", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-08", "date": "2027-08-08", "weekday": "ראשון", "hebrew_date": "ה׳ אב תשפ״ז", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-09", "date": "2027-08-09", "weekday": "שני", "hebrew_date": "ו׳ אב תשפ״ז", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-10", "date": "2027-08-10", "weekday": "שלישי", "hebrew_date": "ז׳ אב תשפ״ז", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-11", "date": "2027-08-11", "weekday": "רביעי", "hebrew_date": "ח׳ אב תשפ״ז", "event_name": "תשעת הימים", "importance": "גבוהה", "recommended_action": "דגים, פסטות ומנות ללא בשר; קמפיין ממוקד", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-12", "date": "2027-08-12", "weekday": "חמישי", "hebrew_date": "ט׳ אב תשפ״ז", "event_name": "תשעה באב", "importance": "מיוחד", "recommended_action": "בדיקת שעות פתיחה והיערכות למוצאי הצום", "owner": "אנה", "status": "פתוח"}, {"id": "cal-2027-08-13", "date": "2027-08-13", "weekday": "שישי", "hebrew_date": "י׳ אב תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-14", "date": "2027-08-14", "weekday": "שבת", "hebrew_date": "י״א אב תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-15", "date": "2027-08-15", "weekday": "ראשון", "hebrew_date": "י״ב אב תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-08-16", "date": "2027-08-16", "weekday": "שני", "hebrew_date": "י״ג אב תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-08-17", "date": "2027-08-17", "weekday": "שלישי", "hebrew_date": "י״ד אב תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-08-18", "date": "2027-08-18", "weekday": "רביעי", "hebrew_date": "ט״ו אב תשפ״ז", "event_name": "ט״ו באב", "importance": "גבוהה", "recommended_action": "קמפיין זוגות / ערב חלבי בוטיק", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-19", "date": "2027-08-19", "weekday": "חמישי", "hebrew_date": "ט״ז אב תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-08-20", "date": "2027-08-20", "weekday": "שישי", "hebrew_date": "י״ז אב תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-21", "date": "2027-08-21", "weekday": "שבת", "hebrew_date": "י״ח אב תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-22", "date": "2027-08-22", "weekday": "ראשון", "hebrew_date": "י״ט אב תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-08-23", "date": "2027-08-23", "weekday": "שני", "hebrew_date": "כ׳ אב תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-08-24", "date": "2027-08-24", "weekday": "שלישי", "hebrew_date": "כ״א אב תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-08-25", "date": "2027-08-25", "weekday": "רביעי", "hebrew_date": "כ״ב אב תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-08-26", "date": "2027-08-26", "weekday": "חמישי", "hebrew_date": "כ״ג אב תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-08-27", "date": "2027-08-27", "weekday": "שישי", "hebrew_date": "כ״ד אב תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-28", "date": "2027-08-28", "weekday": "שבת", "hebrew_date": "כ״ה אב תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-08-29", "date": "2027-08-29", "weekday": "ראשון", "hebrew_date": "כ״ו אב תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-08-30", "date": "2027-08-30", "weekday": "שני", "hebrew_date": "כ״ז אב תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-08-31", "date": "2027-08-31", "weekday": "שלישי", "hebrew_date": "כ״ח אב תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-01", "date": "2027-09-01", "weekday": "רביעי", "hebrew_date": "כ״ט אב תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-02", "date": "2027-09-02", "weekday": "חמישי", "hebrew_date": "ל׳ אב תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-03", "date": "2027-09-03", "weekday": "שישי", "hebrew_date": "א׳ אלול תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-09-04", "date": "2027-09-04", "weekday": "שבת", "hebrew_date": "ב׳ אלול תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-09-05", "date": "2027-09-05", "weekday": "ראשון", "hebrew_date": "ג׳ אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-06", "date": "2027-09-06", "weekday": "שני", "hebrew_date": "ד׳ אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-07", "date": "2027-09-07", "weekday": "שלישי", "hebrew_date": "ה׳ אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-08", "date": "2027-09-08", "weekday": "רביעי", "hebrew_date": "ו׳ אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-09", "date": "2027-09-09", "weekday": "חמישי", "hebrew_date": "ז׳ אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-10", "date": "2027-09-10", "weekday": "שישי", "hebrew_date": "ח׳ אלול תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-09-11", "date": "2027-09-11", "weekday": "שבת", "hebrew_date": "ט׳ אלול תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-09-12", "date": "2027-09-12", "weekday": "ראשון", "hebrew_date": "י׳ אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-13", "date": "2027-09-13", "weekday": "שני", "hebrew_date": "י״א אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-14", "date": "2027-09-14", "weekday": "שלישי", "hebrew_date": "י״ב אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-15", "date": "2027-09-15", "weekday": "רביעי", "hebrew_date": "י״ג אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-16", "date": "2027-09-16", "weekday": "חמישי", "hebrew_date": "י״ד אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-17", "date": "2027-09-17", "weekday": "שישי", "hebrew_date": "ט״ו אלול תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-09-18", "date": "2027-09-18", "weekday": "שבת", "hebrew_date": "ט״ז אלול תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-09-19", "date": "2027-09-19", "weekday": "ראשון", "hebrew_date": "י״ז אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-20", "date": "2027-09-20", "weekday": "שני", "hebrew_date": "י״ח אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-21", "date": "2027-09-21", "weekday": "שלישי", "hebrew_date": "י״ט אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-22", "date": "2027-09-22", "weekday": "רביעי", "hebrew_date": "כ׳ אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-23", "date": "2027-09-23", "weekday": "חמישי", "hebrew_date": "כ״א אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-24", "date": "2027-09-24", "weekday": "שישי", "hebrew_date": "כ״ב אלול תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-09-25", "date": "2027-09-25", "weekday": "שבת", "hebrew_date": "כ״ג אלול תשפ״ז", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-09-26", "date": "2027-09-26", "weekday": "ראשון", "hebrew_date": "כ״ד אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-27", "date": "2027-09-27", "weekday": "שני", "hebrew_date": "כ״ה אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-28", "date": "2027-09-28", "weekday": "שלישי", "hebrew_date": "כ״ו אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-29", "date": "2027-09-29", "weekday": "רביעי", "hebrew_date": "כ״ז אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-09-30", "date": "2027-09-30", "weekday": "חמישי", "hebrew_date": "כ״ח אלול תשפ״ז", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-10-01", "date": "2027-10-01", "weekday": "שישי", "hebrew_date": "כ״ט אלול תשפ״ז", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-02", "date": "2027-10-02", "weekday": "שבת", "hebrew_date": "א׳ תשרי תשפ״ח", "event_name": "ראש השנה", "importance": "גבוהה", "recommended_action": "מגשי אירוח / הזמנות חג", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-03", "date": "2027-10-03", "weekday": "ראשון", "hebrew_date": "ב׳ תשרי תשפ״ח", "event_name": "ראש השנה", "importance": "גבוהה", "recommended_action": "מגשי אירוח / הזמנות חג", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-04", "date": "2027-10-04", "weekday": "שני", "hebrew_date": "ג׳ תשרי תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-10-05", "date": "2027-10-05", "weekday": "שלישי", "hebrew_date": "ד׳ תשרי תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-10-06", "date": "2027-10-06", "weekday": "רביעי", "hebrew_date": "ה׳ תשרי תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-10-07", "date": "2027-10-07", "weekday": "חמישי", "hebrew_date": "ו׳ תשרי תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-10-08", "date": "2027-10-08", "weekday": "שישי", "hebrew_date": "ז׳ תשרי תשפ״ח", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-09", "date": "2027-10-09", "weekday": "שבת", "hebrew_date": "ח׳ תשרי תשפ״ח", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-10", "date": "2027-10-10", "weekday": "ראשון", "hebrew_date": "ט׳ תשרי תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-10-11", "date": "2027-10-11", "weekday": "שני", "hebrew_date": "י׳ תשרי תשפ״ח", "event_name": "יום כיפור", "importance": "מיוחד", "recommended_action": "בדיקת שעות פתיחה והיערכות לפני/אחרי הצום", "owner": "אנה", "status": "פתוח"}, {"id": "cal-2027-10-12", "date": "2027-10-12", "weekday": "שלישי", "hebrew_date": "י״א תשרי תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-10-13", "date": "2027-10-13", "weekday": "רביעי", "hebrew_date": "י״ב תשרי תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-10-14", "date": "2027-10-14", "weekday": "חמישי", "hebrew_date": "י״ג תשרי תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-10-15", "date": "2027-10-15", "weekday": "שישי", "hebrew_date": "י״ד תשרי תשפ״ח", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-16", "date": "2027-10-16", "weekday": "שבת", "hebrew_date": "ט״ו תשרי תשפ״ח", "event_name": "סוכות", "importance": "גבוהה", "recommended_action": "מנות משפחתיות / חופשת ילדים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-17", "date": "2027-10-17", "weekday": "ראשון", "hebrew_date": "ט״ז תשרי תשפ״ח", "event_name": "סוכות", "importance": "גבוהה", "recommended_action": "מנות משפחתיות / חופשת ילדים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-18", "date": "2027-10-18", "weekday": "שני", "hebrew_date": "י״ז תשרי תשפ״ח", "event_name": "סוכות", "importance": "גבוהה", "recommended_action": "מנות משפחתיות / חופשת ילדים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-19", "date": "2027-10-19", "weekday": "שלישי", "hebrew_date": "י״ח תשרי תשפ״ח", "event_name": "סוכות", "importance": "גבוהה", "recommended_action": "מנות משפחתיות / חופשת ילדים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-20", "date": "2027-10-20", "weekday": "רביעי", "hebrew_date": "י״ט תשרי תשפ״ח", "event_name": "סוכות", "importance": "גבוהה", "recommended_action": "מנות משפחתיות / חופשת ילדים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-21", "date": "2027-10-21", "weekday": "חמישי", "hebrew_date": "כ׳ תשרי תשפ״ח", "event_name": "סוכות", "importance": "גבוהה", "recommended_action": "מנות משפחתיות / חופשת ילדים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-22", "date": "2027-10-22", "weekday": "שישי", "hebrew_date": "כ״א תשרי תשפ״ח", "event_name": "סוכות", "importance": "גבוהה", "recommended_action": "מנות משפחתיות / חופשת ילדים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-23", "date": "2027-10-23", "weekday": "שבת", "hebrew_date": "כ״ב תשרי תשפ״ח", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-24", "date": "2027-10-24", "weekday": "ראשון", "hebrew_date": "כ״ג תשרי תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-10-25", "date": "2027-10-25", "weekday": "שני", "hebrew_date": "כ״ד תשרי תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-10-26", "date": "2027-10-26", "weekday": "שלישי", "hebrew_date": "כ״ה תשרי תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-10-27", "date": "2027-10-27", "weekday": "רביעי", "hebrew_date": "כ״ו תשרי תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-10-28", "date": "2027-10-28", "weekday": "חמישי", "hebrew_date": "כ״ז תשרי תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-10-29", "date": "2027-10-29", "weekday": "שישי", "hebrew_date": "כ״ח תשרי תשפ״ח", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-30", "date": "2027-10-30", "weekday": "שבת", "hebrew_date": "כ״ט תשרי תשפ״ח", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-10-31", "date": "2027-10-31", "weekday": "ראשון", "hebrew_date": "ל׳ תשרי תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-01", "date": "2027-11-01", "weekday": "שני", "hebrew_date": "א׳ חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-02", "date": "2027-11-02", "weekday": "שלישי", "hebrew_date": "ב׳ חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-03", "date": "2027-11-03", "weekday": "רביעי", "hebrew_date": "ג׳ חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-04", "date": "2027-11-04", "weekday": "חמישי", "hebrew_date": "ד׳ חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-05", "date": "2027-11-05", "weekday": "שישי", "hebrew_date": "ה׳ חשוון תשפ״ח", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-11-06", "date": "2027-11-06", "weekday": "שבת", "hebrew_date": "ו׳ חשוון תשפ״ח", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-11-07", "date": "2027-11-07", "weekday": "ראשון", "hebrew_date": "ז׳ חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-08", "date": "2027-11-08", "weekday": "שני", "hebrew_date": "ח׳ חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-09", "date": "2027-11-09", "weekday": "שלישי", "hebrew_date": "ט׳ חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-10", "date": "2027-11-10", "weekday": "רביעי", "hebrew_date": "י׳ חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-11", "date": "2027-11-11", "weekday": "חמישי", "hebrew_date": "י״א חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-12", "date": "2027-11-12", "weekday": "שישי", "hebrew_date": "י״ב חשוון תשפ״ח", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-11-13", "date": "2027-11-13", "weekday": "שבת", "hebrew_date": "י״ג חשוון תשפ״ח", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-11-14", "date": "2027-11-14", "weekday": "ראשון", "hebrew_date": "י״ד חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-15", "date": "2027-11-15", "weekday": "שני", "hebrew_date": "ט״ו חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-16", "date": "2027-11-16", "weekday": "שלישי", "hebrew_date": "ט״ז חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-17", "date": "2027-11-17", "weekday": "רביעי", "hebrew_date": "י״ז חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-18", "date": "2027-11-18", "weekday": "חמישי", "hebrew_date": "י״ח חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-19", "date": "2027-11-19", "weekday": "שישי", "hebrew_date": "י״ט חשוון תשפ״ח", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-11-20", "date": "2027-11-20", "weekday": "שבת", "hebrew_date": "כ׳ חשוון תשפ״ח", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-11-21", "date": "2027-11-21", "weekday": "ראשון", "hebrew_date": "כ״א חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-22", "date": "2027-11-22", "weekday": "שני", "hebrew_date": "כ״ב חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-23", "date": "2027-11-23", "weekday": "שלישי", "hebrew_date": "כ״ג חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-24", "date": "2027-11-24", "weekday": "רביעי", "hebrew_date": "כ״ד חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-25", "date": "2027-11-25", "weekday": "חמישי", "hebrew_date": "כ״ה חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-26", "date": "2027-11-26", "weekday": "שישי", "hebrew_date": "כ״ו חשוון תשפ״ח", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-11-27", "date": "2027-11-27", "weekday": "שבת", "hebrew_date": "כ״ז חשוון תשפ״ח", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-11-28", "date": "2027-11-28", "weekday": "ראשון", "hebrew_date": "כ״ח חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-29", "date": "2027-11-29", "weekday": "שני", "hebrew_date": "כ״ט חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-11-30", "date": "2027-11-30", "weekday": "שלישי", "hebrew_date": "ל׳ חשוון תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-01", "date": "2027-12-01", "weekday": "רביעי", "hebrew_date": "א׳ כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-02", "date": "2027-12-02", "weekday": "חמישי", "hebrew_date": "ב׳ כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-03", "date": "2027-12-03", "weekday": "שישי", "hebrew_date": "ג׳ כסלו תשפ״ח", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-12-04", "date": "2027-12-04", "weekday": "שבת", "hebrew_date": "ד׳ כסלו תשפ״ח", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-12-05", "date": "2027-12-05", "weekday": "ראשון", "hebrew_date": "ה׳ כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-06", "date": "2027-12-06", "weekday": "שני", "hebrew_date": "ו׳ כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-07", "date": "2027-12-07", "weekday": "שלישי", "hebrew_date": "ז׳ כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-08", "date": "2027-12-08", "weekday": "רביעי", "hebrew_date": "ח׳ כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-09", "date": "2027-12-09", "weekday": "חמישי", "hebrew_date": "ט׳ כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-10", "date": "2027-12-10", "weekday": "שישי", "hebrew_date": "י׳ כסלו תשפ״ח", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-12-11", "date": "2027-12-11", "weekday": "שבת", "hebrew_date": "י״א כסלו תשפ״ח", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-12-12", "date": "2027-12-12", "weekday": "ראשון", "hebrew_date": "י״ב כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-13", "date": "2027-12-13", "weekday": "שני", "hebrew_date": "י״ג כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-14", "date": "2027-12-14", "weekday": "שלישי", "hebrew_date": "י״ד כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-15", "date": "2027-12-15", "weekday": "רביעי", "hebrew_date": "ט״ו כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-16", "date": "2027-12-16", "weekday": "חמישי", "hebrew_date": "ט״ז כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-17", "date": "2027-12-17", "weekday": "שישי", "hebrew_date": "י״ז כסלו תשפ״ח", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-12-18", "date": "2027-12-18", "weekday": "שבת", "hebrew_date": "י״ח כסלו תשפ״ח", "event_name": "מוצאי שבת", "importance": "בינונית", "recommended_action": "קמפיין סעודה רביעית / סלמון", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-12-19", "date": "2027-12-19", "weekday": "ראשון", "hebrew_date": "י״ט כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-20", "date": "2027-12-20", "weekday": "שני", "hebrew_date": "כ׳ כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-21", "date": "2027-12-21", "weekday": "שלישי", "hebrew_date": "כ״א כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-22", "date": "2027-12-22", "weekday": "רביעי", "hebrew_date": "כ״ב כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-23", "date": "2027-12-23", "weekday": "חמישי", "hebrew_date": "כ״ג כסלו תשפ״ח", "event_name": null, "importance": null, "recommended_action": null, "owner": null, "status": "פתוח"}, {"id": "cal-2027-12-24", "date": "2027-12-24", "weekday": "שישי", "hebrew_date": "כ״ד כסלו תשפ״ח", "event_name": "יום שישי", "importance": "בינונית", "recommended_action": "קמפיין שבת / קציצות דגים / סלטים", "owner": "אנה + מרדכי", "status": "פתוח"}, {"id": "cal-2027-12-25", "date": "2027-12-25", "weekday": "שבת", "hebrew_date": "כ״ה כסלו תשפ״ח", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-12-26", "date": "2027-12-26", "weekday": "ראשון", "hebrew_date": "כ״ו כסלו תשפ״ח", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-12-27", "date": "2027-12-27", "weekday": "שני", "hebrew_date": "כ״ז כסלו תשפ״ח", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-12-28", "date": "2027-12-28", "weekday": "שלישי", "hebrew_date": "כ״ח כסלו תשפ״ח", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-12-29", "date": "2027-12-29", "weekday": "רביעי", "hebrew_date": "כ״ט כסלו תשפ״ח", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-12-30", "date": "2027-12-30", "weekday": "חמישי", "hebrew_date": "ל׳ כסלו תשפ״ח", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}, {"id": "cal-2027-12-31", "date": "2027-12-31", "weekday": "שישי", "hebrew_date": "א׳ טבת תשפ״ח", "event_name": "חנוכה", "importance": "גבוהה", "recommended_action": "משפחות, ילדים, מבצעים ומנות חמות", "owner": "מרדכי", "status": "פתוח"}], "tasks": [{"id": "tk-0", "title": "מסכי כניסה", "category": "שיווק", "owner": "מרדכי", "due_date": null, "status": "מתוכנן", "priority": "רגילה", "notes": null}, {"id": "tk-1", "title": "טאבלטים למלצרים", "category": "שירות", "owner": "מרדכי", "due_date": null, "status": "מתוכנן", "priority": "רגילה", "notes": null}, {"id": "tk-2", "title": "צילום מנות", "category": "שיווק", "owner": "אנה", "due_date": null, "status": "מתוכנן", "priority": "רגילה", "notes": null}, {"id": "tk-3", "title": "פנייה לבתי ספר ועסקים", "category": "מכירות", "owner": "מרדכי", "due_date": null, "status": "מתוכנן", "priority": "רגילה", "notes": null}, {"id": "tk-4", "title": "בדיקת כשרות", "category": "אסטרטגיה", "owner": "אנה + מרדכי", "due_date": null, "status": "מתוכנן", "priority": "רגילה", "notes": null}, {"id": "tk-5", "title": "שדרוג הגשת מנות", "category": "תפריט", "owner": "אנה + מרדכי", "due_date": null, "status": "מתוכנן", "priority": "רגילה", "notes": null}, {"id": "tk-6", "title": "קמפיין סלמון בין המצרים", "category": "שיווק", "owner": "מרדכי", "due_date": null, "status": "בתהליך", "priority": "רגילה", "notes": null}, {"id": "tk-7", "title": "קמפיין קציצות דגים לשישי", "category": "שיווק", "owner": "אנה + מרדכי", "due_date": null, "status": "מתוכנן", "priority": "רגילה", "notes": null}], "menu_items": [{"id": "mn-0", "name": "סלמון בעשבי תיבול", "category": null, "sale_price": null, "food_cost": null, "prep_time": null, "requires_equipment": false, "requires_training": false, "campaign_fit": null, "status": "רעיון", "notes": null}, {"id": "mn-1", "name": "פיש אנד ציפס", "category": null, "sale_price": null, "food_cost": null, "prep_time": null, "requires_equipment": false, "requires_training": false, "campaign_fit": null, "status": "רעיון", "notes": null}, {"id": "mn-2", "name": "קציצות דגים לשישי", "category": null, "sale_price": null, "food_cost": null, "prep_time": null, "requires_equipment": false, "requires_training": false, "campaign_fit": null, "status": "רעיון", "notes": null}, {"id": "mn-3", "name": "פיתות טריות", "category": null, "sale_price": null, "food_cost": null, "prep_time": null, "requires_equipment": false, "requires_training": false, "campaign_fit": null, "status": "רעיון", "notes": null}, {"id": "mn-4", "name": "סלטי הבית", "category": null, "sale_price": null, "food_cost": null, "prep_time": null, "requires_equipment": false, "requires_training": false, "campaign_fit": null, "status": "רעיון", "notes": null}], "cash_flow": [{"id": "cf-1", "date": "2026-07-06", "bank_balance": 100000, "cash_in_register": 7000, "open_supplier_payments": 0, "notes": null}], "leads": [], "employees": [], "shifts": []};
/* … (נתוני לוח שנה 549 יום קוצרו לצורך הביקורת) … */
```

### src/lib/repo.ts
```ts
"use client";

// ============================================================================
// Data access layer. Every screen reads/writes through here — never touching
// Supabase directly. This is the seam where future integrations (Aviv POS,
// bank feeds, mail) will plug in as separate modules without changing screens.
// ============================================================================

import { getSupabase } from "./supabase/client";
import { localDb } from "./local/localDb";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CalendarDay, CashFlowSnapshot, DailyEntry, Employee, Lead, MenuItem, Settings, Shift, Task,
} from "./domain/types";

// Use Supabase cloud when configured; otherwise fall back to the local engine
// (localStorage) so the app works with zero setup.
function db(): SupabaseClient {
  return (getSupabase() ?? localDb) as SupabaseClient;
}

async function all<T>(table: string, orderCol = "date", asc = true): Promise<T[]> {
  const { data, error } = await db().from(table).select("*").order(orderCol, { ascending: asc });
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function insert<T extends object>(table: string, row: Partial<T>): Promise<T> {
  const { data, error } = await db().from(table).insert(row as never).select().single();
  if (error) throw error;
  return data as T;
}

export async function update<T extends object>(table: string, id: string, patch: Partial<T>): Promise<T> {
  const { data, error } = await db().from(table).update(patch as never).eq("id", id).select().single();
  if (error) throw error;
  return data as T;
}

export async function remove(table: string, id: string): Promise<void> {
  const { error } = await db().from(table).delete().eq("id", id);
  if (error) throw error;
}

// upsert a daily entry by date (single-source; date is unique)
export async function upsertDaily(row: Partial<DailyEntry>): Promise<DailyEntry> {
  const { data, error } = await db()
    .from("daily_entries")
    .upsert(row as never, { onConflict: "date" })
    .select()
    .single();
  if (error) throw error;
  return data as DailyEntry;
}

export const repo = {
  dailyEntries: () => all<DailyEntry>("daily_entries", "date", true),
  calendar: () => all<CalendarDay>("business_calendar", "date", true),
  tasks: () => all<Task>("tasks", "created_at", false),
  leads: () => all<Lead>("leads", "created_at", false),
  menu: () => all<MenuItem>("menu_items", "created_at", true),
  cashFlow: () => all<CashFlowSnapshot>("cash_flow", "date", false),
  employees: () => all<Employee>("employees", "created_at", true),
  shifts: () => all<Shift>("shifts", "date", true),
  async settings(): Promise<Settings> {
    const { data, error } = await db().from("settings").select("*").eq("id", 1).single();
    if (error) throw error;
    return data as Settings;
  },
};
```

### src/lib/supabase/client.ts
```ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

// Returns the browser Supabase client, or null when env is not yet configured
// (the UI shows a setup screen in that case — see components/SetupNotice).
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!cached) cached = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cached;
}
```

### src/lib/supabase/config.ts
```ts
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = () =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL.startsWith("http"));
```

