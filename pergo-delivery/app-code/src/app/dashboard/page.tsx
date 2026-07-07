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

  return (
    <>
      {/* Warning lights */}
      <Section>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          {lights.map((l, i) => {
            const c = l.level === "good" ? "var(--good)" : l.level === "warn" ? "var(--warn)" : "var(--bad)";
            const bg = l.level === "good" ? "var(--good-bg)" : l.level === "warn" ? "var(--warn-bg)" : "var(--bad-bg)";
            return (
              <div key={i} className="card p-3.5 flex items-center gap-3" style={{ borderInlineStartWidth: 4, borderInlineStartColor: c }}>
                <div className="grid place-items-center w-9 h-9 rounded-lg shrink-0" style={{ background: bg, color: c }}>
                  <Icon name={l.icon} size={18} />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{l.title}</div>
                  <div className="text-xs truncate" style={{ color: "var(--text-dim)" }}>{l.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Gauges */}
      <Section title="שעוני מחוונים">
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
          <div className="card p-5">
            <Gauge value={m.cumulative} max={m.target} label={`מחזור ${m.monthLabel}`} display={money(m.cumulative)} />
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <Meta k="יעד חודשי" v={money(m.target)} />
              <Meta k="נותר ליעד" v={money(m.remaining)} level={m.remaining ? "warn" : "good"} />
              <Meta k="% מהיעד" v={`${Math.round(m.pctOfTarget * 100)}%`} level={paceLevel} />
            </div>
          </div>

          <div className="card p-5">
            <Gauge value={m.pace} max={m.target * 1.2} label="קצב חודשי משוער"
              display={money(m.pace)}
              zones={[{ to: 0.5 / 1.2, color: "#dc2626" }, { to: 0.83 / 1.2, color: "#d97706" }, { to: 1, color: "#16a34a" }]} />
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <Meta k="ממוצע יומי" v={money(m.avgDaily)} />
              <Meta k="ימים עם נתונים" v={`${m.daysWithData}/${m.daysInMonth}`} />
              <Meta k="למכור ליום" v={money(m.neededPerDay)} level="warn" />
            </div>
          </div>

          <div className="card p-5">
            <Gauge value={m.avgOrder} max={settings.avg_order_target * 2} label="ממוצע הזמנה"
              display={money(m.avgOrder)} />
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <Meta k="יעד" v={money(settings.avg_order_target)} />
              <Meta k="עסקאות" v={nf(m.transactions)} />
              <Meta k="מצב" v={m.avgOrder >= settings.avg_order_target ? "מעל" : "מתחת"} level={aoLevel} />
            </div>
          </div>
        </div>
      </Section>

      {/* KPI row */}
      <Section title="תמונת מצב">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
          <StatCard label="מחזור היום" value={money(m.todayRevenue)} icon="banknote" />
          <StatCard label="משלוחים" value={nf(m.deliveries)} icon="send" />
          <StatCard label="איסוף עצמי" value={nf(m.pickup)} icon="clock" />
          <StatCard label="ישיבה במקום" value={nf(m.dineIn)} icon="utensils" />
          <StatCard label="יתרת בנק" value={money(cash.bankBalance)} icon="banknote" />
          <StatCard label="מזומן בקופה" value={money(cash.cashInRegister)} icon="banknote" />
          <StatCard label="מזומן להפקדה" value={money(cash.cashToDeposit)} level={cash.depositWarn ? "warn" : "good"} icon="arrow-up" />
          <StatCard label="הפרש אמצעי תשלום" value={money(cash.revenueDiff)} level={cash.diffAlert ? "bad" : "good"} icon="alert-triangle" />
        </div>
      </Section>

      {/* Event + tasks */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-extrabold">אירוע עסקי קרוב</h2>
            <Link href="/calendar" className="text-sm" style={{ color: "var(--brand)" }}>לוח שנה ←</Link>
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
            <Link href="/tasks" className="text-sm" style={{ color: "var(--brand)" }}>כל המשימות ←</Link>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <Meta k="בתהליך" v={nf(ts.inProgress)} level="warn" />
            <Meta k="תקועות" v={nf(ts.stuck)} level={ts.stuck ? "bad" : "good"} />
            <Meta k="פתוחות" v={nf(ts.open)} />
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
