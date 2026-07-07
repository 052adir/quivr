"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV, MOBILE_PRIMARY } from "@/config/nav";
import { Icon } from "./Icon";
import { hebrewDate, weekdayHe } from "@/lib/hebrew";
import { gregDate, todayISO } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = NAV.find((n) => pathname.startsWith(n.href));
  const today = todayISO();
  const cloud = isSupabaseConfigured();

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-1">
      {NAV.map((n) => {
        const isActive = pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
            style={{
              background: isActive ? "var(--brand)" : "transparent",
              color: isActive ? "#fff" : "var(--text-dim)",
            }}
          >
            <Icon name={n.icon} size={19} />
            <span className="flex-1">{n.label}</span>
            {!n.ready && <span className="chip text-[10px] px-1.5 py-0">בקרוב</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh md:grid" style={{ gridTemplateColumns: "260px 1fr" }}>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col gap-5 p-4 border-e"
        style={{ borderColor: "var(--border)", background: "var(--surface)", position: "sticky", top: 0, height: "100dvh" }}
      >
        <Brand />
        <NavList />
        <div className="mt-auto text-xs" style={{ color: "var(--text-mute)" }}>
          מערכת ניהול פרגו · v1
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-col min-w-0">
        {/* Header */}
        <header
          className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 88%, transparent)", backdropFilter: "blur(8px)" }}
        >
          <button className="md:hidden btn-ghost btn btn-sm" onClick={() => setOpen(true)} aria-label="תפריט">
            <Icon name="menu" size={20} />
          </button>
          <div className="md:hidden font-extrabold text-lg">פרגו</div>
          <h1 className="hidden md:block text-xl font-extrabold">{active?.label ?? "דשבורד"}</h1>
          <span className="chip" style={{ background: cloud ? "var(--good-bg)" : "var(--surface-2)", color: cloud ? "var(--good)" : "var(--text-dim)", borderColor: "transparent" }}
            title={cloud ? "מחובר ל-Supabase בענן" : "נתונים נשמרים במכשיר זה. ניתן לשדרג לענן בהגדרות."}>
            {cloud ? "☁️ ענן" : "● מצב מקומי"}
          </span>
          <div className="ms-auto text-end leading-tight">
            <div className="text-sm font-bold">{weekdayHe(today)} · {gregDate(today)}</div>
            <div className="text-xs" style={{ color: "var(--text-dim)" }}>{hebrewDate(today)}</div>
          </div>
        </header>

        <main className="p-4 pb-24 md:pb-8 max-w-[1200px] w-full mx-auto">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5 border-t"
        style={{ borderColor: "var(--border)", background: "var(--surface)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV.filter((n) => MOBILE_PRIMARY.includes(n.href))
          .sort((a, b) => MOBILE_PRIMARY.indexOf(a.href) - MOBILE_PRIMARY.indexOf(b.href))
          .map((n) => {
            const isActive = pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className="flex flex-col items-center gap-1 py-2 text-[11px] font-semibold"
                style={{ color: isActive ? "var(--brand)" : "var(--text-mute)" }}>
                <Icon name={n.icon} size={21} />
                {n.label.split(" ")[0]}
              </Link>
            );
          })}
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.4)" }} />
          <div className="absolute inset-y-0 start-0 w-[280px] p-4 flex flex-col gap-5 shadow-xl"
            style={{ background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <Brand />
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}><Icon name="x" size={18} /></button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-10 h-10 rounded-xl grid place-items-center font-extrabold text-white text-lg"
        style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-2))" }}>
        פ
      </div>
      <div>
        <div className="font-extrabold leading-tight">מערכת ניהול פרגו</div>
        <div className="text-xs" style={{ color: "var(--text-dim)" }}>פיצה פרגו · צור הדסה</div>
      </div>
    </div>
  );
}
