import { NextResponse } from "next/server";
import { getServerSupabase, DOCUMENTS_BUCKET } from "@/lib/supabase/server";

// POST /api/documents/upload
// multipart: file + documentType (+ optional periodStart/periodEnd/notes)
// Supabase mode → stores the file in the private `documents` bucket and inserts
// an uploaded_documents row (status: uploaded). Local mode → returns a stub id;
// the client keeps the file and parses it in the browser. No data is applied here.
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const documentType = String(form.get("documentType") || "");
  if (!(file instanceof File) || !documentType) {
    return NextResponse.json({ error: "file and documentType are required" }, { status: 400 });
  }
  const periodStart = (form.get("periodStart") as string) || null;
  const periodEnd = (form.get("periodEnd") as string) || null;
  const notes = (form.get("notes") as string) || null;

  const sb = getServerSupabase();
  if (!sb) {
    // local mode — no server storage; client owns the file
    return NextResponse.json({ mode: "local", documentId: `local-${Date.now()}`, fileName: file.name });
  }

  const path = `${documentType}/${Date.now()}-${file.name}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const up = await sb.storage.from(DOCUMENTS_BUCKET).upload(path, bytes, {
    contentType: file.type || "application/octet-stream", upsert: false,
  });
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

  const { data, error } = await sb
    .from("uploaded_documents")
    .insert({
      document_type: documentType, file_name: file.name, file_path: path,
      period_start: periodStart, period_end: periodEnd, notes, status: "uploaded",
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ mode: "cloud", documentId: data.id, fileName: file.name, filePath: path });
}
