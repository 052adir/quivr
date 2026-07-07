"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo } from "@/lib/repo";
import type { DailyEntry } from "@/lib/domain/types";
import { DataState, EmptyState, DrillBanner } from "@/components/ui";
import { JournalForm } from "@/components/JournalForm";
import { Icon } from "@/components/Icon";
import { money, gregDate, todayISO } from "@/lib/format";
import { useDrill } from "@/hooks/useDrill";

export default function JournalPage() {
  const { data, loading, error, configured, reload } = useData(async () => {
    const [entries, calendar] = await Promise.all([repo.dailyEntries(), repo.calendar()]);
    return { entries, calendar };
  });
  const [editing, setEditing] = useState<DailyEntry | null | undefined>(undefined); // undefined=closed
  const drill = useDrill();

  const applyFilter = (entries: DailyEntry[]) => {
    const t = todayISO();
    const ref = new Date(t);
    switch (drill.filter) {
      case "today": return entries.filter((e) => e.date === t);
      case "month": return entries.filter((e) => { const d = new Date(e.date); return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear(); });
      case "diff": return entries.filter((e) => Math.abs(e.revenue_difference ?? 0) > 0.5);
      case "deposit": return entries.filter((e) => (e.cash_to_deposit ?? 0) > 0);
      default: return entries;
    }
  };

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && (() => { const shown = applyFilter(data.entries); return (
        <>
          {editing !== undefined ? (
            <JournalForm
              calendar={data.calendar}
              initial={editing}
              onSaved={() => { setEditing(undefined); reload(); }}
              onCancel={() => setEditing(undefined)}
            />
          ) : (
            <>
              {editing === undefined && <DrillBanner label={drill.label} />}
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm" style={{ color: "var(--text-dim)" }}>
                  {drill.filter ? `מסונן · ${shown.length} רשומות` : `${data.entries.length} ימים הוזנו · ימים ריקים לא נספרים בגרפים`}
                </div>
                <button className="btn" onClick={() => setEditing(null)}>
                  <Icon name="plus" size={17} /> הזנת יום
                </button>
              </div>
            </>
          )}

          {editing === undefined && (
            shown.length === 0 ? (
              <EmptyState icon="notebook-pen" title="אין ימים בתצוגה זו" hint="לחצו על ‘הזנת יום’ כדי להתחיל" />
            ) : (
              <div className="card table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>תאריך</th><th>יום</th><th>אירוע</th><th>מחזור</th><th>עסקאות</th>
                      <th>ממוצע</th><th>סה״כ תשלום</th><th>הפרש</th><th>להפקדה</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...shown].reverse().map((e) => (
                      <tr key={e.id} className="cursor-pointer" onClick={() => setEditing(e)}>
                        <td className="font-semibold">{gregDate(e.date)}</td>
                        <td style={{ color: "var(--text-dim)" }}>{e.weekday}</td>
                        <td style={{ color: "var(--text-dim)" }}>{e.event || "—"}</td>
                        <td className="font-bold">{e.revenue != null ? money(e.revenue) : "—"}</td>
                        <td>{e.transactions ?? "—"}</td>
                        <td>{e.avg_order != null ? money(e.avg_order) : "—"}</td>
                        <td>{money(e.total_payments)}</td>
                        <td style={{ color: Math.abs(e.revenue_difference ?? 0) > 0.5 ? "var(--bad)" : "var(--text-dim)" }}>
                          {money(e.revenue_difference)}
                        </td>
                        <td style={{ color: (e.cash_to_deposit ?? 0) > 0 ? "var(--warn)" : "var(--text-dim)" }}>
                          {money(e.cash_to_deposit)}
                        </td>
                        <td><Icon name="pencil" size={15} className="opacity-40" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )})()}
    </DataState>
  );
}
