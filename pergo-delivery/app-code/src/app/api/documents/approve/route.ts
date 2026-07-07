import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import type { ExtractedField } from "@/lib/domain/docparse";

// POST /api/documents/approve
// JSON { documentId?, documentType, date?, mode?, approved: ExtractedField[] }
// Applies ONLY the fields the user approved — this is the single write step, and
// it never runs without an explicit call from the confirm UI.
//   z_daily          → upsert into daily_entries for `date` (mode: fill|replace)
//   employee_costing → upsert employees by name
// Other types are recorded as parsed; their business mapping is a later stage.
type Body = {
  documentId?: string;
  documentType: string;
  date?: string;
  mode?: "fill" | "replace";
  approved: ExtractedField[];
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.documentType || !Array.isArray(body.approved)) {
    return NextResponse.json({ error: "documentType and approved[] are required" }, { status: 400 });
  }
  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured (use local mode client-side)" }, { status: 400 });

  let applied = 0;

  if (body.documentType === "z_daily") {
    const date = body.date;
    if (!date) return NextResponse.json({ error: "date is required for z_daily" }, { status: 400 });
    const existing = await sb.from("daily_entries").select("*").eq("date", date).maybeSingle();
    const row: Record<string, unknown> = existing.data ? { ...existing.data } : { date };
    for (const f of body.approved) {
      const empty = row[f.target_field] == null || row[f.target_field] === "";
      if (body.mode === "fill" && !empty) continue;
      row[f.target_field] = Number(f.extracted_value);
      applied++;
    }
    const res = existing.data
      ? await sb.from("daily_entries").update(row).eq("date", date)
      : await sb.from("daily_entries").insert(row);
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  } else if (body.documentType === "employee_costing") {
    for (const f of body.approved) {
      const name = f.field_name;
      const hourly = Number(String(f.extracted_value).replace(/[^\d.\-]/g, "")) || null;
      const found = await sb.from("employees").select("id").eq("name", name).maybeSingle();
      const res = found.data
        ? await sb.from("employees").update({ hourly_cost: hourly }).eq("id", found.data.id)
        : await sb.from("employees").insert({ name, hourly_cost: hourly, status: "פעיל" });
      if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
      applied++;
    }
  } else {
    applied = body.approved.length; // recorded; business mapping is a later stage
  }

  if (body.documentId) {
    await sb.from("uploaded_documents").update({ status: "approved" }).eq("id", body.documentId);
    await sb.from("document_extracted_data").update({ status: "approved" }).eq("document_id", body.documentId);
  }
  return NextResponse.json({ applied });
}
