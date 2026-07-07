"use client";

// ============================================================================
// Local data engine — a Supabase-compatible adapter that persists to
// localStorage. Used automatically when no Supabase cloud is configured, so the
// app works instantly with zero setup. Same query surface as supabase-js, so
// switching to the cloud later requires no screen changes.
//
// Computed fields (avg_order, total_payments, ...) are calculated here, exactly
// mirroring the Postgres GENERATED columns — single-source principle preserved.
// ============================================================================

import { LOCAL_SEED } from "./seed";

const KEY = "pergo_local_v1";
type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function computed(table: string, r: Row): Row {
  if (table === "daily_entries") {
    const tp = num(r.cash_received) + num(r.credit_received) + num(r.tenbis_sibus) + num(r.wolt_mishloha) + num(r.other_payment);
    return {
      ...r,
      avg_order: num(r.transactions) > 0 ? Math.round((num(r.revenue) / num(r.transactions)) * 100) / 100 : null,
      total_payments: tp,
      revenue_difference: tp - num(r.revenue),
      cash_to_deposit: num(r.cash_received) - num(r.cash_deposited),
    };
  }
  if (table === "menu_items") {
    return {
      ...r,
      food_cost_percent: num(r.sale_price) > 0 ? Math.round((num(r.food_cost) / num(r.sale_price)) * 1000) / 10 : null,
      gross_profit: r.sale_price != null ? num(r.sale_price) - num(r.food_cost) : null,
    };
  }
  return r;
}

function load(): Store {
  if (typeof window === "undefined") return structuredClone(LOCAL_SEED) as Store;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {}
  const seeded = structuredClone(LOCAL_SEED) as Store;
  save(seeded);
  return seeded;
}
function save(store: Store) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(store)); } catch {}
}
const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? "id-" + Date.now() + "-" + Math.round(Math.random() * 1e6));

interface Result { data: unknown; error: null }

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: Row | null = null;
  private onConflict = "";
  private filters: [string, unknown][] = [];
  private orderCol = ""; private orderAsc = true;
  private _single = false;
  constructor(private table: string) {}

  select() { return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orderCol = col; this.orderAsc = opts?.ascending !== false; return this; }
  eq(col: string, val: unknown) { this.filters.push([col, val]); return this; }
  single() { this._single = true; return this; }
  insert(row: Row) { this.op = "insert"; this.payload = row; return this; }
  update(patch: Row) { this.op = "update"; this.payload = patch; return this; }
  upsert(row: Row, opts?: { onConflict?: string }) { this.op = "upsert"; this.payload = row; this.onConflict = opts?.onConflict ?? ""; return this; }
  delete() { this.op = "delete"; return this; }

  private match(r: Row) { return this.filters.every(([c, v]) => String(r[c]) === String(v)); }

  private resolve(): Result {
    const store = load();
    const rows = store[this.table] ?? (store[this.table] = []);

    if (this.op === "insert" || this.op === "upsert") {
      const row: Row = { ...this.payload };
      if (this.op === "upsert" && this.onConflict) {
        const i = rows.findIndex((r) => String(r[this.onConflict]) === String(row[this.onConflict]));
        if (i >= 0) { rows[i] = { ...rows[i], ...row, id: rows[i].id }; save(store); return { data: computed(this.table, rows[i]), error: null }; }
      }
      if (row.id == null) row.id = newId();
      rows.push(row); save(store);
      return { data: computed(this.table, row), error: null };
    }
    if (this.op === "update") {
      const i = rows.findIndex((r) => this.match(r));
      if (i >= 0) { rows[i] = { ...rows[i], ...this.payload }; save(store); return { data: computed(this.table, rows[i]), error: null }; }
      return { data: null, error: null };
    }
    if (this.op === "delete") {
      store[this.table] = rows.filter((r) => !this.match(r)); save(store);
      return { data: null, error: null };
    }
    // select
    let out = rows.filter((r) => this.match(r)).map((r) => computed(this.table, r));
    if (this.orderCol) {
      out = out.sort((a, b) => {
        const av = a[this.orderCol] as never, bv = b[this.orderCol] as never;
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * (this.orderAsc ? 1 : -1);
      });
    }
    return { data: this._single ? out[0] ?? null : out, error: null };
  }

  then<T = Result>(onf?: ((v: Result) => T | PromiseLike<T>) | null): PromiseLike<T> {
    return Promise.resolve(this.resolve()).then(onf ?? undefined) as PromiseLike<T>;
  }
}

export const localDb = {
  from(table: string) { return new Query(table); },
} as unknown;

// reset helper (used by settings "restore demo data")
export function resetLocalData() {
  if (typeof window !== "undefined") { window.localStorage.removeItem(KEY); load(); }
}
