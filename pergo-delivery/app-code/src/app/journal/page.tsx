"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo } from "@/lib/repo";
import type { DailyEntry } from "@/lib/domain/types";
import { DataState, EmptyState } from "@/components/ui";
import { JournalForm } from "@/components/JournalForm";
import { Icon } from "@/components/Icon";
import { money, gregDate } from "@/lib/format";

export default function JournalPage() {
  const { data, loading, error, configured, reload } = useData(async () => {
    const [entries, calendar] = await Promise.all([repo.dailyEntries(), repo.calendar()]);
    return { entries, calendar };
  });
  const [editing, setEditing] = useState<DailyEntry | null | undefined>(undefined); // undefined=closed

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && (
        <>
          {editing !== undefined ? (
            <JournalForm
              calendar={data.calendar}
              initial={editing}
              onSaved={() => { setEditing(undefined); reload(); }}
              onCancel={() => setEditing(undefined)}
            />
          ) : (
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm" style={{ color: "var(--text-dim)" }}>
                {data.entries.length} ימים הוזנו · ימים ריקים לא נספרים בגרפים
              </div>
              <button className="btn" onClick={() => setEditing(null)}>
                <Icon name="plus" size={17} /> הזנת יום
              </button>
            </div>
          )}

          {editing === undefined && (
            data.entries.length === 0 ? (
              <EmptyState icon="notebook-pen" title="עדיין אין ימים ביומן" hint="לחצו על ‘הזנת יום’ כדי להתחיל" />
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
                    {[...data.entries].reverse().map((e) => (
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
      )}
    </DataState>
  );
}
