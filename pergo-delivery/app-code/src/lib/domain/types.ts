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
