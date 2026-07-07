"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo, insert, update, remove } from "@/lib/repo";
import type { Employee, Shift } from "@/lib/domain/types";
import { DataState, EmptyState, Badge, Section, StatCard } from "@/components/ui";
import { Modal, Field } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { money, gregShort } from "@/lib/format";
import { WEEKDAYS } from "@/lib/hebrew";

const STATUSES = ["פעיל", "בהשהיה", "סיים"];
const ROLES = ["מנהל משמרת", "טבח", "פיצייה", "מלצר", "משלוחים", "קופה", "עזר מטבח"];

function weekDates(): string[] {
  const now = new Date();
  const sunday = new Date(now); sunday.setDate(now.getDate() - now.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday); d.setDate(sunday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export default function EmployeesPage() {
  const { data, loading, error, configured, reload } = useData(async () => {
    const [employees, shifts] = await Promise.all([repo.employees(), repo.shifts()]);
    return { employees, shifts };
  });
  const [editEmp, setEditEmp] = useState<Partial<Employee> | null>(null);
  const [addShift, setAddShift] = useState<string | null>(null); // date

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && (() => {
        const week = weekDates();
        const empById: Record<string, Employee> = {};
        data.employees.forEach((e) => (empById[e.id] = e));
        const weekShifts = data.shifts.filter((s) => week.includes(s.date));
        const totalHours = weekShifts.reduce((s, x) => s + (x.planned_hours ?? 0), 0);
        const totalCost = weekShifts.reduce((s, x) => {
          const emp = x.employee_id ? empById[x.employee_id] : null;
          const rate = (emp?.employer_cost ?? emp?.hourly_cost ?? 0);
          return s + rate * (x.planned_hours ?? 0);
        }, 0);

        return (
          <>
            <Section title="מצבת שבועית" action={<span className="chip">שבוע נוכחי</span>}>
              <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
                <StatCard label="סך שעות מתוכננות" value={`${totalHours}`} icon="clock" />
                <StatCard label="עלות שכר צפויה" value={money(totalCost)} icon="banknote" level={totalCost > 0 ? "warn" : undefined} />
                <StatCard label="עובדים פעילים" value={`${data.employees.filter((e) => e.status === "פעיל").length}`} icon="users" />
              </div>
              <div className="card table-scroll">
                <table className="data">
                  <thead><tr><th>יום</th><th>תאריך</th><th>משמרות</th><th>שעות</th><th></th></tr></thead>
                  <tbody>
                    {week.map((d, i) => {
                      const shifts = weekShifts.filter((s) => s.date === d);
                      const hrs = shifts.reduce((s, x) => s + (x.planned_hours ?? 0), 0);
                      return (
                        <tr key={d}>
                          <td className="font-semibold">{WEEKDAYS[i]}</td>
                          <td style={{ color: "var(--text-dim)" }}>{gregShort(d)}</td>
                          <td>
                            <div className="flex gap-1.5 flex-wrap">
                              {shifts.length === 0 && <span style={{ color: "var(--text-mute)" }}>—</span>}
                              {shifts.map((s) => (
                                <span key={s.id} className="chip" onClick={async () => { if (confirm("למחוק משמרת?")) { await remove("shifts", s.id); reload(); } }} style={{ cursor: "pointer" }}>
                                  {s.employee_id ? empById[s.employee_id]?.name ?? "?" : "לא שובץ"} · {s.shift_type ?? ""} {s.planned_hours ?? 0}ש׳
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>{hrs || "—"}</td>
                          <td><button className="btn btn-ghost btn-sm" onClick={() => setAddShift(d)}><Icon name="plus" size={14} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>

            <div className="flex justify-between items-center mb-3">
              <h2 className="font-extrabold">עובדים ({data.employees.length})</h2>
              <button className="btn" onClick={() => setEditEmp({ status: "פעיל" })}><Icon name="plus" size={17} /> עובד</button>
            </div>
            {data.employees.length === 0 ? (
              <EmptyState icon="users" title="אין עובדים עדיין" hint="הוסיפו עובד כדי לבנות סידור שבועי" />
            ) : (
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
                {data.employees.map((e) => (
                  <div key={e.id} className="card p-4 cursor-pointer" onClick={() => setEditEmp(e)}>
                    <div className="flex justify-between items-start">
                      <div className="font-bold">{e.name}</div>
                      <Badge level={e.status === "פעיל" ? "good" : e.status === "סיים" ? "bad" : "warn"}>{e.status}</Badge>
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>{e.role ?? "—"}</div>
                    {e.hourly_cost != null && <div className="text-xs mt-1">עלות שעתית: <b>{money(e.hourly_cost)}</b></div>}
                  </div>
                ))}
              </div>
            )}

            {editEmp && <EmployeeModal emp={editEmp} onClose={() => setEditEmp(null)} onSaved={() => { setEditEmp(null); reload(); }} />}
            {addShift && <ShiftModal date={addShift} employees={data.employees} onClose={() => setAddShift(null)} onSaved={() => { setAddShift(null); reload(); }} />}
          </>
        );
      })()}
    </DataState>
  );
}

function EmployeeModal({ emp, onClose, onSaved }: { emp: Partial<Employee>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Employee>>(emp);
  const set = (k: keyof Employee, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.name) return;
    const payload = {
      name: f.name, role: f.role ?? null,
      hourly_cost: f.hourly_cost == null || (f.hourly_cost as unknown) === "" ? null : Number(f.hourly_cost),
      employer_cost: f.employer_cost == null || (f.employer_cost as unknown) === "" ? null : Number(f.employer_cost),
      status: f.status ?? "פעיל",
      internal_rating: f.internal_rating == null || (f.internal_rating as unknown) === "" ? null : Number(f.internal_rating),
      notes: f.notes ?? null,
    };
    if (f.id) await update<Employee>("employees", f.id, payload);
    else await insert<Employee>("employees", payload);
    onSaved();
  }
  return (
    <Modal title={f.id ? "עריכת עובד" : "עובד חדש"} onClose={onClose}
      footer={<>
        <button className="btn" onClick={save} disabled={!f.name}><Icon name="check" size={16} /> שמירה</button>
        {f.id && <button className="btn btn-ghost" style={{ color: "var(--bad)" }} onClick={async () => { await remove("employees", f.id!); onSaved(); }}><Icon name="trash-2" size={16} /></button>}
      </>}>
      <div className="grid gap-3">
        <Field label="שם"><input className="field" value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="תפקיד"><select className="field" value={f.role ?? ""} onChange={(e) => set("role", e.target.value)}><option value="">—</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
          <Field label="סטטוס"><select className="field" value={f.status ?? "פעיל"} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="עלות שעתית (₪)"><input type="number" className="field" value={f.hourly_cost ?? ""} onChange={(e) => set("hourly_cost", e.target.value)} /></Field>
          <Field label="עלות מעסיק לשעה (₪)"><input type="number" className="field" value={f.employer_cost ?? ""} onChange={(e) => set("employer_cost", e.target.value)} /></Field>
        </div>
        <Field label="הערות"><input className="field" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function ShiftModal({ date, employees, onClose, onSaved }: { date: string; employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const [empId, setEmpId] = useState("");
  const [type, setType] = useState("ערב");
  const [hours, setHours] = useState("8");
  async function save() {
    await insert<Shift>("shifts", {
      date, shift_type: type, employee_id: empId || null,
      role: employees.find((e) => e.id === empId)?.role ?? null,
      planned_hours: Number(hours) || 0,
    });
    onSaved();
  }
  return (
    <Modal title={`הוספת משמרת · ${gregShort(date)}`} onClose={onClose}
      footer={<button className="btn" onClick={save}><Icon name="check" size={16} /> הוספה</button>}>
      <div className="grid gap-3">
        <Field label="עובד"><select className="field" value={empId} onChange={(e) => setEmpId(e.target.value)}><option value="">לא שובץ</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="משמרת"><select className="field" value={type} onChange={(e) => setType(e.target.value)}><option>בוקר</option><option>צהריים</option><option>ערב</option></select></Field>
          <Field label="שעות מתוכננות"><input type="number" className="field" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}
