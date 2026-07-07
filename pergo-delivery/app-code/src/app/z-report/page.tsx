"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { repo } from "@/lib/repo";
import { nextBusinessEvent } from "@/lib/domain/calc";
import { DataState, Section } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { money, gregDate, todayISO } from "@/lib/format";
import type { DailyEntry } from "@/lib/domain/types";

function buildReport(e: DailyEntry | null, dateISO: string, extra: { event: string | null; openTasks: string[] }): string {
  const L = (k: string, v: string) => `${k}: ${v}`;
  const lines = [
    `דוח Z יומי – תמונת מצב פרגו`,
    `תאריך: ${gregDate(dateISO)}`,
    ``,
    L("מחזור יומי", e?.revenue != null ? money(e.revenue) : "לא הוזן"),
    L("מספר עסקאות", String(e?.transactions ?? "—")),
    L("ממוצע הזמנה", e?.avg_order != null ? money(e.avg_order) : "—"),
    ``,
    L("מזומן שהתקבל", money(e?.cash_received)),
    L("אשראי / קופה", money(e?.credit_received)),
    L("תן ביס / סיבוס", money(e?.tenbis_sibus)),
    L("וולט / משלוחה", money(e?.wolt_mishloha)),
    L("אחר", money(e?.other_payment)),
    L("סה״כ אמצעי תשלום", money(e?.total_payments)),
    L("הפרש מול מחזור", money(e?.revenue_difference)),
    L("מזומן שהופקד", money(e?.cash_deposited)),
    L("מזומן שצריך להפקיד", money(e?.cash_to_deposit)),
    ``,
    L("משלוחים", String(e?.deliveries ?? "—")),
    L("איסוף עצמי", String(e?.pickup ?? "—")),
    L("ישיבה במקום", String(e?.dine_in ?? "—")),
    ``,
    L("הערות חריגות", e?.notes || "אין"),
    L("אירוע עסקי קרוב", extra.event || "אין אירוע מיוחד בקרוב"),
    ``,
    `משימות פתוחות חשובות:`,
    ...(extra.openTasks.length ? extra.openTasks.map((t) => `• ${t}`) : ["• אין"]),
  ];
  return lines.join("\n");
}

export default function ZReportPage() {
  const [date, setDate] = useState(todayISO());
  const [emails, setEmails] = useState("");
  const [copied, setCopied] = useState(false);

  const { data, loading, error, configured } = useData(async () => {
    const [entries, calendar, tasks] = await Promise.all([repo.dailyEntries(), repo.calendar(), repo.tasks()]);
    return { entries, calendar, tasks };
  });

  return (
    <DataState configured={configured} loading={loading} error={error}>
      {data && (() => {
        const entry = data.entries.find((e) => e.date === date) ?? null;
        const ev = nextBusinessEvent(data.calendar, date);
        const openTasks = data.tasks.filter((t) => t.status !== "בוצע" && (t.priority === "גבוהה" || t.status === "בתהליך")).map((t) => t.title).slice(0, 6);
        const report = buildReport(entry, date, { event: ev ? `${ev.event} (${ev.active ? "כעת" : `בעוד ${ev.daysUntil} ימים`})` : null, openTasks });

        async function copy() { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 1800); }
        const mailto = `mailto:${encodeURIComponent(emails)}?subject=${encodeURIComponent(`דוח Z יומי – פרגו – ${gregDate(date)}`)}&body=${encodeURIComponent(report)}`;

        return (
          <>
            <Section title="דוח Z יומי – תמונת מצב פרגו">
              <div className="card p-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">תאריך הדוח</label>
                  <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">שליחה למיילים (מופרדים בפסיק)</label>
                  <input className="field" placeholder="mordechai@…, ana@…, cpa@…" value={emails} onChange={(e) => setEmails(e.target.value)} style={{ direction: "ltr" }} />
                </div>
              </div>
            </Section>

            <div className="card p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="font-bold text-sm">תצוגה מקדימה</div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost btn-sm" onClick={copy}><Icon name="check" size={15} /> {copied ? "הועתק!" : "העתקה"}</button>
                  <a className="btn btn-sm" href={mailto}><Icon name="send" size={15} /> שליחה במייל</a>
                </div>
              </div>
              <pre className="text-sm p-3 rounded-lg whitespace-pre-wrap" style={{ background: "var(--surface-2)", lineHeight: 1.7 }}>{report}</pre>
              <p className="text-xs mt-3" style={{ color: "var(--text-mute)" }}>
                שליחה ידנית פעילה עכשיו. שליחה אוטומטית יומית בשעה קבועה תתווסף כמודול נפרד (אינטגרציית דיוור) בהמשך.
              </p>
            </div>
          </>
        );
      })()}
    </DataState>
  );
}
