"use client";

import { useState, useEffect } from "react";
import { useData } from "@/hooks/useData";
import { repo, update } from "@/lib/repo";
import type { Settings } from "@/lib/domain/types";
import { DataState, Section } from "@/components/ui";
import { Field } from "@/components/Modal";
import { Icon } from "@/components/Icon";

export default function SettingsPage() {
  const { data, loading, error, configured, reload } = useData(() => repo.settings());
  const [f, setF] = useState<Partial<Settings>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (data) setF(data); }, [data]);
  const set = (k: keyof Settings, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    await update<Settings>("settings", "1", {
      business_name: f.business_name, location: f.location,
      monthly_target: Number(f.monthly_target), avg_order_target: Number(f.avg_order_target),
      food_cost_target: Number(f.food_cost_target), cash_deposit_alert: Number(f.cash_deposit_alert),
      partners: (typeof f.partners === "string" ? (f.partners as string).split(",").map((s) => s.trim()) : f.partners) as string[],
    });
    setSaved(true); setTimeout(() => setSaved(false), 1800); reload();
  }

  return (
    <DataState configured={configured} loading={loading} error={error}>
      <Section title="הגדרות מערכת">
        <div className="card p-5 grid gap-3 max-w-xl">
          <div className="grid grid-cols-2 gap-3">
            <Field label="שם העסק"><input className="field" value={f.business_name ?? ""} onChange={(e) => set("business_name", e.target.value)} /></Field>
            <Field label="מיקום"><input className="field" value={f.location ?? ""} onChange={(e) => set("location", e.target.value)} /></Field>
            <Field label="יעד מחזור חודשי (₪)"><input type="number" className="field" value={f.monthly_target ?? ""} onChange={(e) => set("monthly_target", e.target.value)} /></Field>
            <Field label="יעד ממוצע הזמנה (₪)"><input type="number" className="field" value={f.avg_order_target ?? ""} onChange={(e) => set("avg_order_target", e.target.value)} /></Field>
            <Field label="יעד פוד קוסט (%)"><input type="number" className="field" value={f.food_cost_target ?? ""} onChange={(e) => set("food_cost_target", e.target.value)} /></Field>
            <Field label="סף התראת הפקדה (₪)"><input type="number" className="field" value={f.cash_deposit_alert ?? ""} onChange={(e) => set("cash_deposit_alert", e.target.value)} /></Field>
          </div>
          <Field label="שותפים (מופרדים בפסיק)">
            <input className="field" value={Array.isArray(f.partners) ? f.partners.join(", ") : ((f.partners as unknown as string) ?? "")} onChange={(e) => set("partners", e.target.value)} />
          </Field>
          <div className="flex items-center gap-3 mt-2">
            <button className="btn" onClick={save}><Icon name="check" size={16} /> שמירה</button>
            {saved && <span className="text-sm" style={{ color: "var(--good)" }}>נשמר ✓</span>}
          </div>
        </div>
      </Section>

      <Section title="תפקידים (עתידי)">
        <div className="card p-4 text-sm" style={{ color: "var(--text-dim)" }}>
          מבנה ההרשאות מוכן בארכיטקטורה: <b>מנהל · שותפה · עובד · רואה חשבון</b>.
          בשלב זה אין אכיפת הרשאות — יתווסף כמודול נפרד ללא שינוי בליבת המערכת.
        </div>
      </Section>
    </DataState>
  );
}
