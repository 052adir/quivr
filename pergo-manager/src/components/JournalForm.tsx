"use client";

import { useMemo, useState } from "react";
import type { CalendarDay, DailyEntry } from "@/lib/domain/types";
import { hebrewDate, weekdayHe } from "@/lib/hebrew";
import { money } from "@/lib/format";
import { upsertDaily } from "@/lib/repo";
import { Icon } from "./Icon";

type NumKey =
  | "revenue" | "transactions" | "deliveries" | "pickup" | "dine_in"
  | "cash_received" | "credit_received" | "tenbis_sibus" | "wolt_mishloha"
  | "other_payment" | "cash_deposited";

const NUM_FIELDS: { key: NumKey; label: string; group: string }[] = [
  { key: "revenue", label: "מחזור יומי (₪)", group: "מכירות" },
  { key: "transactions", label: "מספר עסקאות", group: "מכירות" },
  { key: "deliveries", label: "משלוחים", group: "סוג הזמנה" },
  { key: "pickup", label: "איסוף עצמי", group: "סוג הזמנה" },
  { key: "dine_in", label: "ישיבה במקום", group: "סוג הזמנה" },
  { key: "cash_received", label: "מזומן שהתקבל", group: "אמצעי תשלום" },
  { key: "credit_received", label: "אשראי / קופה", group: "אמצעי תשלום" },
  { key: "tenbis_sibus", label: "תן ביס / סיבוס", group: "אמצעי תשלום" },
  { key: "wolt_mishloha", label: "וולט / משלוחה", group: "אמצעי תשלום" },
  { key: "other_payment", label: "אחר", group: "אמצעי תשלום" },
  { key: "cash_deposited", label: "מזומן שהופקד לבנק", group: "הפקדות" },
];

const GROUPS = ["מכירות", "סוג הזמנה", "אמצעי תשלום", "הפקדות"];

export function JournalForm({
  calendar, initial, onSaved, onCancel,
}: {
  calendar: CalendarDay[];
  initial?: DailyEntry | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const calByDate = useMemo(() => {
    const m: Record<string, CalendarDay> = {};
    calendar.forEach((c) => (m[c.date] = c));
    return m;
  }, [calendar]);

  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [event, setEvent] = useState(initial?.event ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    NUM_FIELDS.forEach((f) => (o[f.key] = initial?.[f.key] != null ? String(initial[f.key]) : ""));
    return o;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // auto-fill event from calendar when date changes (unless user typed one)
  const calEvent = calByDate[date]?.event_name ?? "";
  const effectiveEvent = event || calEvent;

  const n = (k: string) => parseFloat(vals[k] || "0") || 0;
  const totalPayments = n("cash_received") + n("credit_received") + n("tenbis_sibus") + n("wolt_mishloha") + n("other_payment");
  const revenueDiff = totalPayments - n("revenue");
  const cashToDeposit = n("cash_received") - n("cash_deposited");
  const avgOrder = n("transactions") > 0 ? n("revenue") / n("transactions") : 0;

  async function save() {
    setSaving(true); setErr(null);
    try {
      const row: Partial<DailyEntry> = {
        date,
        weekday: weekdayHe(date),
        hebrew_date: hebrewDate(date),
        event: effectiveEvent || null,
        notes: notes || null,
      };
      NUM_FIELDS.forEach((f) => {
        (row as Record<string, number | null>)[f.key] = vals[f.key] === "" ? null : n(f.key);
      });
      await upsertDaily(row);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-extrabold text-lg">{initial ? "עריכת יום" : "הזנת יום חדש"}</h2>
        {onCancel && <button className="btn btn-ghost btn-sm" onClick={onCancel}><Icon name="x" size={16} /></button>}
      </div>

      {/* date + auto fields */}
      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <div>
          <label className="label">תאריך</label>
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">אירוע / חג / תקופה</label>
          <input className="field" placeholder={calEvent || "ללא"} value={event} onChange={(e) => setEvent(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 flex-wrap mb-4 text-sm" style={{ color: "var(--text-dim)" }}>
        <span className="chip">{weekdayHe(date)}</span>
        <span className="chip">{hebrewDate(date)}</span>
        {calEvent && <span className="chip chip-brand">מהלוח: {calEvent}</span>}
      </div>

      {/* grouped number fields */}
      {GROUPS.map((g) => (
        <div key={g} className="mb-4">
          <div className="text-xs font-bold mb-2" style={{ color: "var(--text-dim)" }}>{g}</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            {NUM_FIELDS.filter((f) => f.group === g).map((f) => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input type="number" inputMode="decimal" className="field" value={vals[f.key]}
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} placeholder="0" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div>
        <label className="label">הערות חריגות</label>
        <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="למשל: צום, חג, אירוע מיוחד…" />
      </div>

      {/* live computed */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        <Computed k="ממוצע הזמנה" v={money(avgOrder)} />
        <Computed k="סה״כ אמצעי תשלום" v={money(totalPayments)} />
        <Computed k="הפרש מול מחזור" v={money(revenueDiff)} level={Math.abs(revenueDiff) > 0.5 ? "bad" : "good"} />
        <Computed k="מזומן להפקדה" v={money(cashToDeposit)} level={cashToDeposit > 0 ? "warn" : "good"} />
      </div>

      {err && <div className="text-sm mt-3" style={{ color: "var(--bad)" }}>{err}</div>}

      <div className="flex gap-2 mt-5">
        <button className="btn" onClick={save} disabled={saving}>
          <Icon name="check" size={17} /> {saving ? "שומר…" : "שמירה"}
        </button>
        {onCancel && <button className="btn btn-ghost" onClick={onCancel}>ביטול</button>}
      </div>
    </div>
  );
}

function Computed({ k, v, level }: { k: string; v: string; level?: "good" | "warn" | "bad" }) {
  const c = level === "good" ? "var(--good)" : level === "warn" ? "var(--warn)" : level === "bad" ? "var(--bad)" : "var(--brand)";
  return (
    <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--surface-2)" }}>
      <div className="text-[11px]" style={{ color: "var(--text-mute)" }}>{k}</div>
      <div className="font-extrabold" style={{ color: c }}>{v}</div>
    </div>
  );
}
