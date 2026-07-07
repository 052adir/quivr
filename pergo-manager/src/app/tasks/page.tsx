"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo, insert, update, remove } from "@/lib/repo";
import type { Task, TaskStatus } from "@/lib/domain/types";
import { DataState, EmptyState, Badge, DrillBanner } from "@/components/ui";
import { Modal, Field } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { gregDate } from "@/lib/format";
import { useDrill } from "@/hooks/useDrill";
import { useEffect } from "react";

const STATUSES: TaskStatus[] = ["מתוכנן", "בתהליך", "בוצע", "תקוע"];
const CATEGORIES = ["שיווק", "תפריט", "תפעול", "כספים", "ספקים", "שירות", "עובדים", "כשרות", "מכירות", "אסטרטגיה"];
const PRIORITIES = ["גבוהה", "רגילה", "נמוכה"];

const statusLevel = (s: string) => (s === "בוצע" ? "good" : s === "תקוע" ? "bad" : s === "בתהליך" ? "warn" : undefined);

export default function TasksPage() {
  const { data, loading, error, configured, reload } = useData(() => repo.tasks());
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [filter, setFilter] = useState<string>("");
  const drill = useDrill();
  useEffect(() => {
    if (drill.filter === "open") setFilter("open");
    else if (drill.filter) setFilter(drill.filter);
  }, [drill.filter]);

  const tasks = (data ?? []).filter((t) =>
    !filter ? true : filter === "open" ? t.status !== "בוצע" : t.status === filter
  );

  return (
    <DataState configured={configured} loading={loading} error={error}>
      <DrillBanner label={drill.label} />
      <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          <FilterChip active={filter === ""} onClick={() => setFilter("")}>הכל</FilterChip>
          {STATUSES.map((s) => <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>{s}</FilterChip>)}
        </div>
        <button className="btn" onClick={() => setEdit({ status: "מתוכנן", priority: "רגילה" })}>
          <Icon name="plus" size={17} /> משימה
        </button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon="list-checks" title="אין משימות" hint="הוסיפו משימה חדשה" />
      ) : (
        <div className="grid gap-2.5">
          {tasks.map((t) => (
            <div key={t.id} className="card p-4 flex items-center gap-3">
              <button
                title="סמן כבוצע"
                onClick={async () => { await update<Task>("tasks", t.id, { status: t.status === "בוצע" ? "מתוכנן" : "בוצע" }); reload(); }}
                className="w-6 h-6 rounded-md grid place-items-center shrink-0"
                style={{ border: "2px solid var(--border)", background: t.status === "בוצע" ? "var(--good)" : "transparent", color: "#fff" }}
              >
                {t.status === "בוצע" && <Icon name="check" size={14} />}
              </button>
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setEdit(t)}>
                <div className="font-bold" style={{ textDecoration: t.status === "בוצע" ? "line-through" : "none", color: t.status === "בוצע" ? "var(--text-mute)" : "var(--text)" }}>
                  {t.title}
                </div>
                <div className="flex gap-1.5 flex-wrap mt-1">
                  <Badge level={statusLevel(t.status)}>{t.status}</Badge>
                  {t.category && <Badge>{t.category}</Badge>}
                  {t.owner && <Badge>👤 {t.owner}</Badge>}
                  {t.priority === "גבוהה" && <Badge level="bad">עדיפות גבוהה</Badge>}
                  {t.due_date && <Badge>יעד: {gregDate(t.due_date)}</Badge>}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEdit(t)}><Icon name="pencil" size={15} /></button>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <TaskModal task={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
      )}
    </DataState>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="chip" style={{ background: active ? "var(--brand)" : undefined, color: active ? "#fff" : undefined, borderColor: active ? "transparent" : undefined, cursor: "pointer" }}>
      {children}
    </button>
  );
}

function TaskModal({ task, onClose, onSaved }: { task: Partial<Task>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Task>>(task);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Task, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    if (!f.title) return;
    setSaving(true);
    const payload = {
      title: f.title, category: f.category ?? null, owner: f.owner ?? null,
      due_date: f.due_date || null, status: f.status ?? "מתוכנן", priority: f.priority ?? "רגילה", notes: f.notes ?? null,
    };
    if (f.id) await update<Task>("tasks", f.id, payload);
    else await insert<Task>("tasks", payload);
    setSaving(false); onSaved();
  }

  return (
    <Modal title={f.id ? "עריכת משימה" : "משימה חדשה"} onClose={onClose}
      footer={<>
        <button className="btn" onClick={save} disabled={saving || !f.title}><Icon name="check" size={16} /> שמירה</button>
        {f.id && <button className="btn btn-ghost" style={{ color: "var(--bad)" }} onClick={async () => { await remove("tasks", f.id!); onSaved(); }}><Icon name="trash-2" size={16} /> מחיקה</button>}
      </>}>
      <div className="grid gap-3">
        <Field label="שם המשימה"><input className="field" value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="תחום">
            <select className="field" value={f.category ?? ""} onChange={(e) => set("category", e.target.value)}>
              <option value="">—</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="אחראי"><input className="field" value={f.owner ?? ""} onChange={(e) => set("owner", e.target.value)} /></Field>
          <Field label="סטטוס">
            <select className="field" value={f.status ?? "מתוכנן"} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
          <Field label="עדיפות">
            <select className="field" value={f.priority ?? "רגילה"} onChange={(e) => set("priority", e.target.value)}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
        </div>
        <Field label="תאריך יעד"><input type="date" className="field" value={f.due_date ?? ""} onChange={(e) => set("due_date", e.target.value)} /></Field>
        <Field label="הערות"><input className="field" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
