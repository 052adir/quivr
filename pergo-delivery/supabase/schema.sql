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
-- ============================================================================
-- מודול "ייבוא מסמכים" — מבנה נתונים בלבד (המסך המלא = "בקרוב").
-- זרימה: העלאה → ניתוח → טבלת תצוגה מקדימה → אישור משתמש → קליטה.
-- אין עדכון אוטומטי ללא אישור; קבצים באחסון פרטי (Supabase Storage).
-- ============================================================================

-- מסמכים שהועלו
create table if not exists uploaded_documents (
  id            uuid primary key default gen_random_uuid(),
  document_type text not null,   -- z_daily / profit_loss / trial_balance / suppliers_ledger / raw_material_purchases / sales_report
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
