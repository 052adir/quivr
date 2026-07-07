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
