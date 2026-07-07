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
