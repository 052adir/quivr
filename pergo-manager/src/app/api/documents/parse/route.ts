import { NextResponse } from "next/server";
import { getServerSupabase, DOCUMENTS_BUCKET } from "@/lib/supabase/server";
import { parseFile, extractByType, csvToRows, xlsxToRows } from "@/lib/domain/docparse";

// POST /api/documents/parse
// Either multipart (file + documentType) — parse the uploaded file directly — or
// JSON { documentId, documentType } to fetch a stored file from Supabase Storage
// and parse it. Returns { rows, extractedData[] } for the confirm UI. Nothing is
// written to business tables here; the user must approve first.
export async function POST(req: Request) {
  const ct = req.headers.get("content-type") || "";

  // multipart: parse the file straight from the request
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const documentType = String(form.get("documentType") || "");
    if (!(file instanceof File) || !documentType) {
      return NextResponse.json({ error: "file and documentType are required" }, { status: 400 });
    }
    const parsed = await parseFile(await file.arrayBuffer(), file.name, documentType);
    return NextResponse.json({ kind: parsed.kind, rows: parsed.rows.slice(0, 50), extractedData: parsed.extracted });
  }

  // JSON: fetch a previously uploaded document from storage, then parse
  const body = await req.json().catch(() => ({}));
  const { documentId, documentType } = body as { documentId?: string; documentType?: string };
  const sb = getServerSupabase();
  if (!sb || !documentId || !documentType) {
    return NextResponse.json({ error: "documentId, documentType and Supabase are required for stored parse" }, { status: 400 });
  }
  const doc = await sb.from("uploaded_documents").select("file_path, file_name").eq("id", documentId).single();
  if (doc.error || !doc.data?.file_path) {
    return NextResponse.json({ error: doc.error?.message || "document not found" }, { status: 404 });
  }
  const dl = await sb.storage.from(DOCUMENTS_BUCKET).download(doc.data.file_path);
  if (dl.error || !dl.data) return NextResponse.json({ error: dl.error?.message || "download failed" }, { status: 500 });

  const ab = await dl.data.arrayBuffer();
  const ext = (doc.data.file_name.split(".").pop() || "").toLowerCase();
  const rows = ext === "csv" ? csvToRows(new TextDecoder().decode(ab)) : ext === "xlsx" ? await xlsxToRows(ab) : [];
  const extractedData = extractByType(documentType, rows);

  // stage extracted rows for the confirm UI, and mark the doc parsed
  if (extractedData.length) {
    await sb.from("document_extracted_data").insert(
      extractedData.map((e) => ({
        document_id: documentId, field_name: e.field_name, extracted_value: e.extracted_value,
        target_table: e.target_table, target_field: e.target_field,
        confidence_score: e.confidence_score, status: "pending",
      })),
    );
    await sb.from("uploaded_documents").update({ status: "parsed" }).eq("id", documentId);
  }
  return NextResponse.json({ kind: "stored", rows: rows.slice(0, 50), extractedData });
}
