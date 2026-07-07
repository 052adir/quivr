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
