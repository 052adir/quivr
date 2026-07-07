"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo, update } from "@/lib/repo";
import type { CalendarDay } from "@/lib/domain/types";
import { DataState, EmptyState, Badge } from "@/components/ui";
import { gregDate, todayISO } from "@/lib/format";

const STATUSES = ["פתוח", "בתהליך", "בוצע"];
const MAJOR = new Set(["בין המצרים", "תשעת הימים", "תשעה באב", "ט״ו באב", "ראש השנה", "יום כיפור", "סוכות", "חנוכה", "פורים", "פסח", "שבועות"]);

export default function CalendarPage() {
  const { data, loading, error, configured, reload } = useData(() => repo.calendar());
  const [onlyHolidays, setOnlyHolidays] = useState(true);
  const today = todayISO();

  return (
    <DataState configured={configured} loading={loading} error={error}>
      <div className="flex gap-1.5 mb-4">
        <Chip active={onlyHolidays} onClick={() => setOnlyHolidays(true)}>חגים ואירועים</Chip>
        <Chip active={!onlyHolidays} onClick={() => setOnlyHolidays(false)}>כל הימים המסומנים</Chip>
      </div>

      {data && (() => {
        const rows = data
          .filter((c) => c.date >= today && c.event_name)
          .filter((c) => (onlyHolidays ? MAJOR.has(c.event_name!.trim()) : true))
          .slice(0, 80);
        if (rows.length === 0) return <EmptyState icon="calendar-days" title="אין אירועים קרובים" />;
        return (
          <div className="grid gap-2.5">
            {rows.map((c) => {
              const days = Math.round((new Date(c.date).getTime() - new Date(today).getTime()) / 86400000);
              return (
                <div key={c.id} className="card p-4 flex gap-3 items-start">
                  <div className="grid place-items-center rounded-xl shrink-0 text-center" style={{ width: 56, height: 56, background: "var(--surface-2)" }}>
                    <div className="font-extrabold text-lg leading-none">{days === 0 ? "היום" : days}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-mute)" }}>{days === 0 ? "" : "ימים"}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{c.event_name}</span>
                      {c.importance && <Badge level={c.importance === "גבוהה" ? "bad" : "warn"}>{c.importance}</Badge>}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>
                      {gregDate(c.date)} · {c.weekday} · {c.hebrew_date}
                    </div>
                    {c.recommended_action && (
                      <div className="text-sm mt-2 p-2 rounded-lg" style={{ background: "var(--surface-2)" }}>{c.recommended_action}</div>
                    )}
                    <div className="flex gap-2 items-center mt-2 flex-wrap">
                      {c.owner && <Badge>👤 {c.owner}</Badge>}
                      <select className="chip" style={{ cursor: "pointer" }} value={c.status ?? "פתוח"}
                        onChange={async (e) => { await update<CalendarDay>("business_calendar", c.id, { status: e.target.value }); reload(); }}>
                        {STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </DataState>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="chip" style={{ background: active ? "var(--brand)" : undefined, color: active ? "#fff" : undefined, borderColor: active ? "transparent" : undefined, cursor: "pointer" }}>
      {children}
    </button>
  );
}
