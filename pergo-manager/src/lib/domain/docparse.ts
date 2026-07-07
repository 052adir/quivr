// ============================================================================
// Document parsing — isomorphic (browser + route handlers). Reads CSV / XLSX
// into rows, then extracts fields per document type. Mirrors the logic proven
// in the live app. No auto-apply: callers get ExtractedField[] to confirm.
// XLSX uses the platform ZIP + DecompressionStream (Node 18+ / Edge / browser).
// ============================================================================

export type Rows = string[][];

export type ExtractedField = {
  field_name: string;
  extracted_value: string;
  target_table: string;
  target_field: string;
  existing_value?: string | null;
  confidence_score: number; // 0..1
  status: "pending";
};

export type ParsedDocument = {
  rows: Rows;
  extracted: ExtractedField[];
  kind: "csv" | "xlsx" | "unsupported";
};

// ---------- CSV ----------
export function csvToRows(text: string): Rows {
  const nl = text.replace(/\r\n?/g, "\n");
  const first = nl.split("\n")[0] || "";
  const delim =
    first.split("\t").length > first.split(",").length ? "\t"
    : first.split(";").length > first.split(",").length ? ";" : ",";
  const rows: Rows = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < nl.length; i++) {
    const ch = nl[i];
    if (q) { if (ch === '"') { if (nl[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ---------- XLSX ----------
function colIndex(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref || "");
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
type ZipEntry = { method: number; comp: Uint8Array };
function unzip(ab: ArrayBuffer): Record<string, ZipEntry> {
  const dv = new DataView(ab), u8 = new Uint8Array(ab), files: Record<string, ZipEntry> = {};
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error("not a zip");
  const cnt = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < cnt && off + 46 <= u8.length; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true),
      fnlen = dv.getUint16(off + 28, true), exlen = dv.getUint16(off + 30, true), cmlen = dv.getUint16(off + 32, true),
      lho = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + fnlen));
    const lfn = dv.getUint16(lho + 26, true), lex = dv.getUint16(lho + 28, true), dataStart = lho + 30 + lfn + lex;
    files[name] = { method, comp: u8.subarray(dataStart, dataStart + csize) };
    off += 46 + fnlen + exlen + cmlen;
  }
  return files;
}
async function entry(files: Record<string, ZipEntry>, name: string): Promise<Uint8Array | null> {
  const f = files[name];
  if (!f) return null;
  return f.method === 0 ? f.comp : await inflateRaw(f.comp);
}
export async function xlsxToRows(ab: ArrayBuffer): Promise<Rows> {
  const files = unzip(ab), dec = new TextDecoder();
  let shared: string[] = [];
  const ss = await entry(files, "xl/sharedStrings.xml");
  if (ss) {
    const doc = new DOMParser().parseFromString(dec.decode(ss), "application/xml");
    shared = Array.from(doc.getElementsByTagName("si")).map((si) =>
      Array.from(si.getElementsByTagName("t")).map((t) => t.textContent).join(""));
  }
  let sheet = "xl/worksheets/sheet1.xml";
  if (!files[sheet]) {
    const k = Object.keys(files).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    if (k) sheet = k;
  }
  const sh = await entry(files, sheet);
  if (!sh) return [];
  const doc = new DOMParser().parseFromString(dec.decode(sh), "application/xml");
  const rows: Rows = [];
  Array.from(doc.getElementsByTagName("row")).forEach((r) => {
    const cells: string[] = [];
    Array.from(r.getElementsByTagName("c")).forEach((c) => {
      const col = colIndex(c.getAttribute("r") || ""), t = c.getAttribute("t");
      let v = "";
      const vEl = c.getElementsByTagName("v")[0], isEl = c.getElementsByTagName("is")[0];
      if (t === "s" && vEl) v = shared[+(vEl.textContent || 0)] || "";
      else if ((t === "inlineStr" || t === "str") && (isEl || vEl)) v = (isEl || vEl).textContent || "";
      else if (vEl) v = vEl.textContent || "";
      cells[col] = v;
    });
    for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = "";
    rows.push(cells);
  });
  return rows;
}

// ---------- extraction ----------
const num = (s: unknown) => {
  const v = parseFloat(String(s == null ? "" : s).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(v) ? v : null;
};
const looksNum = (c: unknown) => /^-?\d[\d,.]*$/.test(String(c == null ? "" : c).trim());
function looksHeader(row: string[]): boolean {
  const kw = /תאריך|מחזור|מזומן|אשראי|עסקא|סה.?כ|עובד|שם|שכר|עלות|ספק|סכום|קטגוריה|תפקיד|שעת|מעביד|כמות|פריט|חשבון|יתרה|תן ?ביס|וולט|משלוח|איסוף|ישיבה/i;
  return row.some((c) => kw.test(String(c))) && row.filter(looksNum).length <= 1;
}

const Z_FIELDS: [RegExp, string, string][] = [
  [/מחזור/, "revenue", "מחזור יומי"], [/עסקא/, "transactions", "מספר עסקאות"],
  [/מזומן/, "cash_received", "מזומן שהתקבל"], [/אשראי|קופה/, "credit_received", "אשראי / קופה"],
  [/תן ?ביס|סיבוס/, "tenbis_sibus", "תן ביס / סיבוס"], [/וולט|משלוחה/, "wolt_mishloha", "וולט / משלוחה"],
  [/משלוחים/, "deliveries", "משלוחים"], [/איסוף/, "pickup", "איסוף עצמי"],
  [/ישיבה/, "dine_in", "ישיבה במקום"], [/אחר/, "other_payment", "אחר"],
];

// header row + one wide data row → key/value pairs (common POS Z export)
function widePairs(rows: Rows): [string, string][] {
  if (!looksHeader(rows[0])) return [];
  const body = rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ""));
  if (!body.length || !body.every((r) => r.filter(looksNum).length >= 2)) return [];
  const out: [string, string][] = [];
  body.forEach((r) => rows[0].forEach((h, i) => {
    const v = r[i];
    if (v != null && String(v).trim() !== "" && looksNum(v)) out.push([String(h).trim(), String(v).trim()]);
  }));
  return out;
}

function extractZ(rows: Rows): ExtractedField[] {
  const clean = rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  const pairs = widePairs(clean);
  const labeled: { label: string; value: number | null }[] = pairs.length
    ? pairs.map(([label, v]) => ({ label, value: num(v) }))
    : clean.map((r) => {
        const label = r.filter((c) => !looksNum(c)).join(" ").trim();
        const value = num(r.find((c) => looksNum(c)));
        return { label, value };
      });
  const out: ExtractedField[] = [];
  labeled.forEach(({ label, value }) => {
    const f = Z_FIELDS.find((z) => z[0].test(label));
    if (f && value != null) out.push({
      field_name: f[2], extracted_value: String(value),
      target_table: "daily_entries", target_field: f[1],
      confidence_score: 0.95, status: "pending",
    });
  });
  return out;
}

const ROLE_ALIASES: Record<string, string> = {
  "טבח": "טבח", "שף": "טבח", "מלצר": "מלצרית", "מלצרית": "מלצרית",
  "מארח": "מארחת", "מארחת": "מארחת", "מנהל": "מנהל", "אחראי": "מנהל",
};

function extractEmployees(rows: Rows): ExtractedField[] {
  const clean = rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  if (!clean.length) return [];
  const hdr = looksHeader(clean[0]) ? clean[0] : null;
  const idx = { name: -1, role: -1, hourly: -1, employer: -1 };
  if (hdr) hdr.forEach((h, i) => {
    if (/שם/.test(h) && idx.name < 0) idx.name = i;
    else if (/תפקיד|תחום/.test(h)) idx.role = i;
    else if (/מעביד|מעסיק/.test(h)) idx.employer = i;
    else if (/לשעה|שעת/.test(h)) idx.hourly = i;
    else if (/עלות|שכר/.test(h) && idx.hourly < 0) idx.hourly = i;
  });
  const body = hdr ? clean.slice(1) : clean;
  const out: ExtractedField[] = [];
  body.forEach((r) => {
    let name = "", role: string | null = null, hourly: number | null = null;
    if (hdr && idx.name >= 0) {
      name = String(r[idx.name] || "").trim();
      const raw = idx.role >= 0 ? String(r[idx.role] || "").trim() : "";
      role = raw ? (ROLE_ALIASES[raw] || raw) : null;
      hourly = num(r[idx.hourly]);
    } else {
      const toks = r.join(" ").replace(/[,;₪]/g, " ").split(/\s+/).filter(Boolean);
      const nm: string[] = [];
      toks.forEach((t) => {
        if (looksNum(t) && hourly == null) hourly = num(t);
        else if (ROLE_ALIASES[t]) role = ROLE_ALIASES[t];
        else nm.push(t);
      });
      name = nm.join(" ");
    }
    if (!name) return;
    const conf = role && hourly != null ? 0.9 : 0.6;
    out.push({
      field_name: name, extracted_value: `${role || "—"} · ${hourly != null ? hourly + "₪/ש" : "—"}`,
      target_table: "employees", target_field: "hourly_cost",
      confidence_score: conf, status: "pending",
    });
  });
  return out;
}

// amount docs (pl / purch / supp / sales / bal): label + amount rows
function extractAmounts(rows: Rows, target: string): ExtractedField[] {
  const clean = rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  const body = looksHeader(clean[0]) ? clean.slice(1) : clean;
  const out: ExtractedField[] = [];
  body.forEach((r) => {
    const label = r.filter((c) => !looksNum(c)).join(" ").trim();
    const amount = num(r.find((c) => looksNum(c)));
    if (label && amount != null) out.push({
      field_name: label, extracted_value: String(amount),
      target_table: target, target_field: "amount",
      confidence_score: 0.8, status: "pending",
    });
  });
  return out;
}

const TARGET_BY_TYPE: Record<string, string> = {
  profit_loss: "expense_analysis", raw_material_purchases: "expense_analysis",
  suppliers_ledger: "expense_analysis", sales_report: "expense_analysis",
  trial_balance: "expense_analysis",
};

export function extractByType(documentType: string, rows: Rows): ExtractedField[] {
  if (documentType === "z_daily") return extractZ(rows);
  if (documentType === "employee_costing") return extractEmployees(rows);
  return extractAmounts(rows, TARGET_BY_TYPE[documentType] || "expense_analysis");
}

export async function parseFile(
  buffer: ArrayBuffer, fileName: string, documentType: string,
): Promise<ParsedDocument> {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (ext === "csv") {
    const rows = csvToRows(new TextDecoder().decode(buffer));
    return { rows, extracted: extractByType(documentType, rows), kind: "csv" };
  }
  if (ext === "xlsx") {
    const rows = await xlsxToRows(buffer);
    return { rows, extracted: extractByType(documentType, rows), kind: "xlsx" };
  }
  // pdf / images / xls: structure ready, extraction is a later stage
  return { rows: [], extracted: [], kind: "unsupported" };
}
