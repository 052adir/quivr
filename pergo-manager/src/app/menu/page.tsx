"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo, insert, update, remove } from "@/lib/repo";
import type { MenuItem, MenuStatus } from "@/lib/domain/types";
import { DataState, EmptyState, Badge } from "@/components/ui";
import { Modal, Field } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { money } from "@/lib/format";

const STATUSES: MenuStatus[] = ["רעיון", "בבדיקה", "בפיילוט", "פעיל", "ירד"];
const CATEGORIES = ["פיצה", "דגים", "סלטים", "מאפים", "שתייה", "קינוחים", "אחר"];

export default function MenuPage() {
  const { data, loading, error, configured, reload } = useData(async () => {
    const [menu, settings] = await Promise.all([repo.menu(), repo.settings()]);
    return { menu, settings };
  });
  const [edit, setEdit] = useState<Partial<MenuItem> | null>(null);

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && (
        <>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm" style={{ color: "var(--text-dim)" }}>יעד פוד קוסט: {data.settings.food_cost_target}%</div>
            <button className="btn" onClick={() => setEdit({ status: "רעיון" })}><Icon name="plus" size={17} /> מנה</button>
          </div>

          {data.menu.length === 0 ? (
            <EmptyState icon="utensils" title="אין מנות עדיין" />
          ) : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
              {data.menu.map((mi) => {
                const fc = mi.food_cost_percent;
                const high = fc != null && fc > data.settings.food_cost_target;
                return (
                  <div key={mi.id} className="card p-4 cursor-pointer" onClick={() => setEdit(mi)}>
                    <div className="flex justify-between items-start">
                      <div className="font-bold">{mi.name}</div>
                      <Badge level={mi.status === "פעיל" ? "good" : mi.status === "ירד" ? "bad" : undefined}>{mi.status}</Badge>
                    </div>
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      {mi.category && <Badge>{mi.category}</Badge>}
                      {mi.campaign_fit && <Badge level="brand">{mi.campaign_fit}</Badge>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                      <Cell k="מחיר" v={mi.sale_price != null ? money(mi.sale_price) : "—"} />
                      <Cell k="עלות" v={mi.food_cost != null ? money(mi.food_cost) : "—"} />
                      <Cell k="פוד קוסט" v={fc != null ? `${fc}%` : "—"} level={fc == null ? undefined : high ? "bad" : "good"} />
                    </div>
                    {mi.gross_profit != null && (
                      <div className="text-xs mt-2" style={{ color: "var(--text-dim)" }}>רווח גולמי: <b>{money(mi.gross_profit)}</b></div>
                    )}
                    {high && <div className="text-xs mt-1" style={{ color: "var(--bad)" }}>⚠ פוד קוסט מעל היעד — דורש החלטה מפורשת</div>}
                  </div>
                );
              })}
            </div>
          )}

          {edit && <MenuModal item={edit} target={data.settings.food_cost_target} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
        </>
      )}
    </DataState>
  );
}

function Cell({ k, v, level }: { k: string; v: string; level?: "good" | "bad" }) {
  const c = level === "good" ? "var(--good)" : level === "bad" ? "var(--bad)" : "var(--text)";
  return (
    <div className="rounded-lg py-1.5" style={{ background: "var(--surface-2)" }}>
      <div className="text-[10px]" style={{ color: "var(--text-mute)" }}>{k}</div>
      <div className="font-bold text-sm" style={{ color: c }}>{v}</div>
    </div>
  );
}

function MenuModal({ item, target, onClose, onSaved }: { item: Partial<MenuItem>; target: number; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<MenuItem>>(item);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof MenuItem, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  const price = Number(f.sale_price) || 0, cost = Number(f.food_cost) || 0;
  const fcPct = price > 0 ? Math.round((cost / price) * 1000) / 10 : null;
  const high = fcPct != null && fcPct > target;

  async function save() {
    if (!f.name) return;
    setSaving(true);
    const payload = {
      name: f.name, category: f.category ?? null,
      sale_price: f.sale_price === undefined || f.sale_price === null || (f.sale_price as unknown) === "" ? null : Number(f.sale_price),
      food_cost: f.food_cost === undefined || f.food_cost === null || (f.food_cost as unknown) === "" ? null : Number(f.food_cost),
      prep_time: f.prep_time == null || (f.prep_time as unknown) === "" ? null : Number(f.prep_time),
      requires_equipment: !!f.requires_equipment, requires_training: !!f.requires_training,
      campaign_fit: f.campaign_fit ?? null, status: f.status ?? "רעיון", notes: f.notes ?? null,
    };
    if (f.id) await update<MenuItem>("menu_items", f.id, payload);
    else await insert<MenuItem>("menu_items", payload);
    setSaving(false); onSaved();
  }

  return (
    <Modal title={f.id ? "עריכת מנה" : "מנה חדשה"} onClose={onClose}
      footer={<>
        <button className="btn" onClick={save} disabled={saving || !f.name}><Icon name="check" size={16} /> שמירה</button>
        {f.id && <button className="btn btn-ghost" style={{ color: "var(--bad)" }} onClick={async () => { await remove("menu_items", f.id!); onSaved(); }}><Icon name="trash-2" size={16} /></button>}
      </>}>
      <div className="grid gap-3">
        <Field label="שם המנה"><input className="field" value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="קטגוריה"><select className="field" value={f.category ?? ""} onChange={(e) => set("category", e.target.value)}><option value="">—</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="סטטוס"><select className="field" value={f.status ?? "רעיון"} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="מחיר מכירה (₪)"><input type="number" className="field" value={f.sale_price ?? ""} onChange={(e) => set("sale_price", e.target.value)} /></Field>
          <Field label="עלות חומרי גלם (₪)"><input type="number" className="field" value={f.food_cost ?? ""} onChange={(e) => set("food_cost", e.target.value)} /></Field>
          <Field label="זמן הכנה (דק׳)"><input type="number" className="field" value={f.prep_time ?? ""} onChange={(e) => set("prep_time", e.target.value)} /></Field>
          <Field label="מתאים לקמפיין"><input className="field" value={f.campaign_fit ?? ""} onChange={(e) => set("campaign_fit", e.target.value)} /></Field>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: high ? "var(--bad-bg)" : "var(--surface-2)" }}>
          <div className="text-xs" style={{ color: "var(--text-mute)" }}>פוד קוסט מחושב</div>
          <div className="font-extrabold text-lg" style={{ color: high ? "var(--bad)" : "var(--good)" }}>{fcPct != null ? `${fcPct}%` : "—"}</div>
          {high && <div className="text-xs" style={{ color: "var(--bad)" }}>מעל היעד ({target}%) — נדרש אישור מפורש</div>}
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.requires_equipment} onChange={(e) => set("requires_equipment", e.target.checked)} /> דורש ציוד מיוחד</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.requires_training} onChange={(e) => set("requires_training", e.target.checked)} /> דורש הכשרת עובדים</label>
        </div>
        <Field label="הערות"><input className="field" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
