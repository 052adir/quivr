// Formatting helpers (Hebrew / ILS).

export const nf = (n: number | null | undefined, digits = 0) =>
  new Intl.NumberFormat("he-IL", { maximumFractionDigits: digits }).format(
    Number.isFinite(n as number) ? (n as number) : 0
  );

export const money = (n: number | null | undefined, digits = 0) => "₪" + nf(n, digits);

export const pct = (n: number | null | undefined) => `${Math.round((n ?? 0) * 100)}%`;

export const gregDate = (d: string | Date) =>
  new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    typeof d === "string" ? new Date(d) : d
  );

export const gregShort = (d: string | Date) =>
  new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit" }).format(
    typeof d === "string" ? new Date(d) : d
  );

export const todayISO = () => new Date().toISOString().slice(0, 10);
