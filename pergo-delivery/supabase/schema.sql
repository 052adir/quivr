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
