"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo, insert, update, remove } from "@/lib/repo";
import type { Lead, FunnelStage } from "@/lib/domain/types";
import { DataState, EmptyState, Badge, Section } from "@/components/ui";
import { Modal, Field } from "@/components/Modal";
import { Icon } from "@/components/Icon";

const STAGES: FunnelStage[] = ["אותר", "טעימה נשלחה", "שיחת מעקב", "הזמנה ראשונה", "לקוח קבוע"];
const CATEGORIES = ["בית ספר", "ישיבה", "עסק", "משרד", "מוסד"];
// Quarterly targets from the spec
const TARGETS: Record<FunnelStage, number> = { "אותר": 100, "טעימה נשלחה": 100, "שיחת מעקב": 50, "הזמנה ראשונה": 20, "לקוח קבוע": 10 };

export default function LeadsPage() {
  const { data, loading, error, configured, reload } = useData(() => repo.leads());
  const [edit, setEdit] = useState<Partial<Lead> | null>(null);

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && (() => {
        // count reached-at-least-this-stage
        const idx = (s: string) => STAGES.indexOf(s as FunnelStage);
        const reached = (stage: FunnelStage) => data.filter((l) => idx(l.funnel_stage) >= idx(stage)).length;
        return (
          <>
            <Section title="משפך לקוחות עסקיים (יעד רבעוני)">
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
                {STAGES.map((s) => {
                  const val = s === "אותר" ? data.length : reached(s);
                  const target = TARGETS[s];
                  const pct = Math.min(100, Math.round((val / target) * 100));
                  return (
                    <div key={s} className="card p-4">
                      <div className="text-xs font-semibold" style={{ color: "var(--text-dim)" }}>{s}</div>
                      <div className="text-2xl font-extrabold mt-0.5">{val}<span className="text-sm font-normal" style={{ color: "var(--text-mute)" }}> / {target}</span></div>
                      <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: "var(--surface-2)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--brand)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <div className="flex justify-between items-center mb-3">
              <h2 className="font-extrabold">רשימת לקוחות ({data.length})</h2>
              <button className="btn" onClick={() => setEdit({ funnel_stage: "אותר", personal_letter_sent: false, first_order: false })}>
                <Icon name="plus" size={17} /> לקוח
              </button>
            </div>

            {data.length === 0 ? (
              <EmptyState icon="target" title="אין לקוחות פוטנציאליים עדיין" hint="הוסיפו בית ספר, ישיבה, עסק או מוסד" />
            ) : (
              <div className="grid gap-2.5">
                {data.map((l) => (
                  <div key={l.id} className="card p-4 flex items-center gap-3 cursor-pointer" onClick={() => setEdit(l)}>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{l.business_name}</div>
                      <div className="flex gap-1.5 flex-wrap mt-1">
                        <Badge level="brand">{l.funnel_stage}</Badge>
                        {l.category && <Badge>{l.category}</Badge>}
                        {l.contact_name && <Badge>{l.contact_name}</Badge>}
                        {l.personal_letter_sent && <Badge level="good">מכתב נשלח</Badge>}
                      </div>
                    </div>
                    <Icon name="pencil" size={15} className="opacity-40" />
                  </div>
                ))}
              </div>
            )}

            {edit && <LeadModal lead={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
          </>
        );
      })()}
    </DataState>
  );
}

function LeadModal({ lead, onClose, onSaved }: { lead: Partial<Lead>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Lead>>(lead);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Lead, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    if (!f.business_name) return;
    setSaving(true);
    const payload = {
      business_name: f.business_name, category: f.category ?? null, contact_name: f.contact_name ?? null,
      role: f.role ?? null, phone: f.phone ?? null, address: f.address ?? null, tasting_item: f.tasting_item ?? null,
      personal_letter_sent: !!f.personal_letter_sent, delivery_date: f.delivery_date || null,
      funnel_stage: f.funnel_stage ?? "אותר", followup_date: f.followup_date || null, first_order: !!f.first_order, notes: f.notes ?? null,
    };
    if (f.id) await update<Lead>("leads", f.id, payload);
    else await insert<Lead>("leads", payload);
    setSaving(false); onSaved();
  }

  return (
    <Modal title={f.id ? "עריכת לקוח" : "לקוח חדש"} onClose={onClose}
      footer={<>
        <button className="btn" onClick={save} disabled={saving || !f.business_name}><Icon name="check" size={16} /> שמירה</button>
        {f.id && <button className="btn btn-ghost" style={{ color: "var(--bad)" }} onClick={async () => { await remove("leads", f.id!); onSaved(); }}><Icon name="trash-2" size={16} /></button>}
      </>}>
      <div className="grid gap-3">
        <Field label="שם העסק / מוסד"><input className="field" value={f.business_name ?? ""} onChange={(e) => set("business_name", e.target.value)} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="קטגוריה"><select className="field" value={f.category ?? ""} onChange={(e) => set("category", e.target.value)}><option value="">—</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="שלב במשפך"><select className="field" value={f.funnel_stage ?? "אותר"} onChange={(e) => set("funnel_stage", e.target.value)}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="איש קשר"><input className="field" value={f.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} /></Field>
          <Field label="תפקיד"><input className="field" value={f.role ?? ""} onChange={(e) => set("role", e.target.value)} /></Field>
          <Field label="טלפון"><input className="field" value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="מנת טעימה"><input className="field" value={f.tasting_item ?? ""} onChange={(e) => set("tasting_item", e.target.value)} /></Field>
          <Field label="תאריך מסירה"><input type="date" className="field" value={f.delivery_date ?? ""} onChange={(e) => set("delivery_date", e.target.value)} /></Field>
          <Field label="שיחת מעקב"><input type="date" className="field" value={f.followup_date ?? ""} onChange={(e) => set("followup_date", e.target.value)} /></Field>
        </div>
        <Field label="כתובת"><input className="field" value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.personal_letter_sent} onChange={(e) => set("personal_letter_sent", e.target.checked)} /> צורף מכתב אישי</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.first_order} onChange={(e) => set("first_order", e.target.checked)} /> בוצעה הזמנה ראשונה</label>
        </div>
        <Field label="הערות"><input className="field" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
