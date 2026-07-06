// ============================================================================
// Pure business logic. No framework, no I/O — easy to test and reuse.
// All screens derive their numbers from here (single source principle).
// ============================================================================

import type { CalendarDay, DailyEntry, Settings, Task } from "./types";

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
