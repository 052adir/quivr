"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

// Returns the browser Supabase client, or null when env is not yet configured
// (the UI shows a setup screen in that case — see components/SetupNotice).
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!cached) cached = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cached;
}
