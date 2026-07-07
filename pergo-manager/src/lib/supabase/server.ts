import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

// Server-side Supabase client for route handlers (document upload/parse/approve).
// Uses the service-role key when present (needed for Storage writes), otherwise
// the anon key. Returns null when Supabase isn't configured — routes then run in
// "local mode": parsing happens client-side and nothing is written server-side.
export function getServerSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

export const DOCUMENTS_BUCKET = "documents";
