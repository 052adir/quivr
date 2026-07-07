"use client";

import { Icon } from "./Icon";
import type { StatusLevel } from "@/lib/domain/calc";

export function Section({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h2 className="text-base font-extrabold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label, value, sub, level, icon,
}: { label: string; value: string; sub?: string; level?: StatusLevel; icon?: string }) {
  const color = level === "good" ? "var(--good)" : level === "warn" ? "var(--warn)" : level === "bad" ? "var(--bad)" : "var(--text)";
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold" style={{ color: "var(--text-dim)" }}>{label}</div>
        {icon && <Icon name={icon} size={16} className="opacity-40" />}
      </div>
      <div className="text-2xl font-extrabold mt-1" style={{ color }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "var(--text-mute)" }}>{sub}</div>}
    </div>
  );
}

export function Badge({ level, children }: { level?: StatusLevel | "brand"; children: React.ReactNode }) {
  const cls =
    level === "good" ? "chip chip-good" :
    level === "warn" ? "chip chip-warn" :
    level === "bad" ? "chip chip-bad" :
    level === "brand" ? "chip chip-brand" : "chip";
  return <span className={cls}>{children}</span>;
}

export function EmptyState({ icon = "search", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="card p-10 text-center">
      <div className="inline-grid place-items-center w-14 h-14 rounded-full mb-3" style={{ background: "var(--surface-2)" }}>
        <Icon name={icon} size={26} className="opacity-50" />
      </div>
      <div className="font-bold">{title}</div>
      {hint && <div className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>{hint}</div>}
    </div>
  );
}

export function Spinner({ label = "טוען…" }: { label?: string }) {
  return (
    <div className="card p-10 text-center" style={{ color: "var(--text-dim)" }}>
      <Icon name="refresh-cw" size={22} className="inline animate-spin opacity-60" />
      <div className="mt-2 text-sm">{label}</div>
    </div>
  );
}

// Wraps a screen body: shows setup notice / spinner / error / content.
export function DataState({
  configured, loading, error, children,
}: {
  configured: boolean; loading: boolean; error: string | null; children: React.ReactNode;
}) {
  if (!configured) return <SetupNotice />;
  if (loading) return <Spinner />;
  if (error) return (
    <div className="card p-6" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
      <div className="font-bold flex items-center gap-2"><Icon name="alert-triangle" size={18} /> שגיאה בטעינה</div>
      <div className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>{error}</div>
    </div>
  );
  return <>{children}</>;
}

export function SetupNotice() {
  return (
    <div className="card p-6 max-w-2xl">
      <div className="flex items-center gap-2 font-extrabold text-lg">
        <Icon name="settings" size={22} /> חיבור ל-Supabase נדרש
      </div>
      <p className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>
        המערכת מוכנה — נותר רק לחבר אותה למסד הנתונים שלך. שלושה צעדים:
      </p>
      <ol className="text-sm mt-3 space-y-2" style={{ color: "var(--text)" }}>
        <li>1. פתחו פרויקט חינמי ב־<b>supabase.com</b> (או השתמשו בקיים).</li>
        <li>2. הריצו את הקובץ <code className="chip">supabase/migrations/0001_init.sql</code> ואז <code className="chip">supabase/seed.sql</code> ב-SQL Editor.</li>
        <li>3. העתיקו את <b>Project URL</b> ו-<b>anon key</b> לקובץ <code className="chip">.env.local</code>:</li>
      </ol>
      <pre className="mt-3 p-3 rounded-lg text-xs overflow-x-auto" style={{ background: "var(--surface-2)", direction: "ltr" }}>
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...`}
      </pre>
      <p className="text-sm mt-3" style={{ color: "var(--text-dim)" }}>לאחר מכן הפעילו מחדש את השרת — והכל יעבוד עם הנתונים שלכם.</p>
    </div>
  );
}
