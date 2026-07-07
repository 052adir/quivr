"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo, insert } from "@/lib/repo";
import type { CashFlowSnapshot } from "@/lib/domain/types";
import { cashStatus } from "@/lib/domain/calc";
import { DataState, StatCard, Section, DrillBanner } from "@/components/ui";
import { Modal, Field } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { money, todayISO } from "@/lib/format";
import { useDrill } from "@/hooks/useDrill";

export default function CashflowPage() {
  const { data, loading, error, configured, reload } = useData(async () => {
    const [entries, settings, cashFlow] = await Promise.all([repo.dailyEntries(), repo.settings(), repo.cashFlow()]);
    return { entries, settings, cashFlow };
  });
  const [edit, setEdit] = useState(false);
  const drill = useDrill();

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && (() => {
        const snap = data.cashFlow[0] ?? null;
        const c = cashStatus(data.entries, snap, data.settings);
        return (
          <>
            <DrillBanner label={drill.label} />
            {c.depositWarn && <Alert level="warn" text={`יש ${money(c.cashToDeposit)} מזומן שטרם הופקד לבנק — מומלץ להפקיד.`} />}
            {c.diffAlert && <Alert level="bad" text="קיים הפרש בין סה״כ אמצעי התשלום למחזור — דורש בדיקה." />}

            <Section title="יתרות נוכחיות" action={<button className="btn btn-sm" onClick={() => setEdit(true)}><Icon name="pencil" size={15} /> עדכון יתרות</button>}>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
                <StatCard label="יתרת בנק" value={money(c.bankBalance)} icon="banknote" />
                <StatCard label="מזומן בקופה" value={money(c.cashInRegister)} icon="banknote" />
                <StatCard label="תשלומים פתוחים לספקים" value={money(c.openSupplierPayments)} icon="receipt" level={c.openSupplierPayments > 0 ? "warn" : undefined} />
              </div>
            </Section>

            <Section title="מזומן והפקדות (החודש)">
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
                <StatCard label="מזומן שהתקבל" value={money(c.cashReceivedMonth)} icon="arrow-down" />
                <StatCard label="מזומן שהופקד" value={money(c.cashDepositedMonth)} icon="arrow-up" />
                <StatCard label="עדיין צריך להפקיד" value={money(c.cashToDeposit)} level={c.depositWarn ? "warn" : "good"} icon="banknote" />
                <StatCard label="הפרש מול מחזור" value={money(c.revenueDiff)} level={c.diffAlert ? "bad" : "good"} icon="alert-triangle" />
              </div>
              <p className="text-xs mt-3" style={{ color: "var(--text-mute)" }}>
                נתוני המזומן וההפקדות מחושבים אוטומטית מהיומן היומי — אין צורך להזין פעמיים.
              </p>
            </Section>

            {snap?.notes && <div className="card p-4 text-sm"><b>הערות תזרים:</b> {snap.notes}</div>}

            {edit && <SnapshotModal onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} last={snap} />}
          </>
        );
      })()}
    </DataState>
  );
}

function Alert({ level, text }: { level: "warn" | "bad"; text: string }) {
  const c = level === "bad" ? "var(--bad)" : "var(--warn)";
  const bg = level === "bad" ? "var(--bad-bg)" : "var(--warn-bg)";
  return (
    <div className="card p-3.5 mb-4 flex items-center gap-3" style={{ borderInlineStartWidth: 4, borderInlineStartColor: c, background: bg }}>
      <Icon name="alert-triangle" size={20} className="shrink-0" />
      <div className="text-sm font-semibold">{text}</div>
    </div>
  );
}

function SnapshotModal({ onClose, onSaved, last }: { onClose: () => void; onSaved: () => void; last: CashFlowSnapshot | null }) {
  const [bank, setBank] = useState(last?.bank_balance != null ? String(last.bank_balance) : "");
  const [cash, setCash] = useState(last?.cash_in_register != null ? String(last.cash_in_register) : "");
  const [sup, setSup] = useState(last?.open_supplier_payments != null ? String(last.open_supplier_payments) : "");
  const [notes, setNotes] = useState(last?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await insert<CashFlowSnapshot>("cash_flow", {
      date: todayISO(),
      bank_balance: bank === "" ? null : Number(bank),
      cash_in_register: cash === "" ? null : Number(cash),
      open_supplier_payments: sup === "" ? null : Number(sup),
      notes: notes || null,
    });
    setSaving(false); onSaved();
  }

  return (
    <Modal title="עדכון יתרות" onClose={onClose}
      footer={<button className="btn" onClick={save} disabled={saving}><Icon name="check" size={16} /> שמירה</button>}>
      <div className="grid gap-3">
        <Field label="יתרת בנק (₪)"><input type="number" className="field" value={bank} onChange={(e) => setBank(e.target.value)} /></Field>
        <Field label="מזומן בקופה (₪)"><input type="number" className="field" value={cash} onChange={(e) => setCash(e.target.value)} /></Field>
        <Field label="תשלומים פתוחים לספקים (₪)"><input type="number" className="field" value={sup} onChange={(e) => setSup(e.target.value)} /></Field>
        <Field label="הערות תזרים"><input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
