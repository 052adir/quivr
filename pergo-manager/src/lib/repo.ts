"use client";

// ============================================================================
// Data access layer. Every screen reads/writes through here — never touching
// Supabase directly. This is the seam where future integrations (Aviv POS,
// bank feeds, mail) will plug in as separate modules without changing screens.
// ============================================================================

import { getSupabase } from "./supabase/client";
import type {
  CalendarDay, CashFlowSnapshot, DailyEntry, Employee, Lead, MenuItem, Settings, Shift, Task,
} from "./domain/types";

function db() {
  const s = getSupabase();
  if (!s) throw new Error("Supabase not configured");
  return s;
}

async function all<T>(table: string, orderCol = "date", asc = true): Promise<T[]> {
  const { data, error } = await db().from(table).select("*").order(orderCol, { ascending: asc });
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function insert<T extends object>(table: string, row: Partial<T>): Promise<T> {
  const { data, error } = await db().from(table).insert(row as never).select().single();
  if (error) throw error;
  return data as T;
}

export async function update<T extends object>(table: string, id: string, patch: Partial<T>): Promise<T> {
  const { data, error } = await db().from(table).update(patch as never).eq("id", id).select().single();
  if (error) throw error;
  return data as T;
}

export async function remove(table: string, id: string): Promise<void> {
  const { error } = await db().from(table).delete().eq("id", id);
  if (error) throw error;
}

// upsert a daily entry by date (single-source; date is unique)
export async function upsertDaily(row: Partial<DailyEntry>): Promise<DailyEntry> {
  const { data, error } = await db()
    .from("daily_entries")
    .upsert(row as never, { onConflict: "date" })
    .select()
    .single();
  if (error) throw error;
  return data as DailyEntry;
}

export const repo = {
  dailyEntries: () => all<DailyEntry>("daily_entries", "date", true),
  calendar: () => all<CalendarDay>("business_calendar", "date", true),
  tasks: () => all<Task>("tasks", "created_at", false),
  leads: () => all<Lead>("leads", "created_at", false),
  menu: () => all<MenuItem>("menu_items", "created_at", true),
  cashFlow: () => all<CashFlowSnapshot>("cash_flow", "date", false),
  employees: () => all<Employee>("employees", "created_at", true),
  shifts: () => all<Shift>("shifts", "date", true),
  async settings(): Promise<Settings> {
    const { data, error } = await db().from("settings").select("*").eq("id", 1).single();
    if (error) throw error;
    return data as Settings;
  },
};
