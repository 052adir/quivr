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
