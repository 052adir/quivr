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
