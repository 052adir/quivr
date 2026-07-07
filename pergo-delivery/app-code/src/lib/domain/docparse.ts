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
  kind: "csv" | "xlsx" | "pdf" | "unsupported";
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
// Regex-based XML reading (no DOMParser) so this runs in route handlers/Edge too.
function unescapeXml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
export async function xlsxToRows(ab: ArrayBuffer): Promise<Rows> {
  const files = unzip(ab), dec = new TextDecoder();
  let shared: string[] = [];
  const ss = await entry(files, "xl/sharedStrings.xml");
  if (ss) {
    const xml = dec.decode(ss);
    shared = (xml.match(/<si>[\s\S]*?<\/si>/g) || []).map((si) => {
      let text = "";
      si.replace(/<t[^>]*>([\s\S]*?)<\/t>/g, (_, g) => { text += unescapeXml(g); return ""; });
      return text;
    });
  }
  let sheet = "xl/worksheets/sheet1.xml";
  if (!files[sheet]) {
    const k = Object.keys(files).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    if (k) sheet = k;
  }
  const sh = await entry(files, sheet);
  if (!sh) return [];
  const xml = dec.decode(sh);
  const rows: Rows = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const cells: string[] = [];
    const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cRe.exec(rm[1]))) {
      const attrs = cm[1], body = cm[2] || "";
      const col = colIndex((/r="([A-Z]+)\d+"/.exec(attrs) || [])[1] || "");
      const t = (/t="([^"]+)"/.exec(attrs) || [])[1];
      const vM = /<v>([\s\S]*?)<\/v>/.exec(body);
      const isM = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body);
      let v = "";
      if (t === "s" && vM) v = shared[+vM[1]] || "";
      else if ((t === "inlineStr" || t === "str") && (isM || vM)) v = unescapeXml((isM ? isM[1] : vM![1]));
      else if (vM) v = vM[1];
      cells[col] = v;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = "";
    rows.push(cells);
  }
  return rows;
}

// ---------- PDF (best-effort text: FlateDecode + cp1255 Hebrew) ----------
async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array | null> {
  for (const fmt of ["deflate", "deflate-raw"] as const) {
    try {
      const ds = new DecompressionStream(fmt);
      const s = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(s).arrayBuffer());
    } catch { /* try next */ }
  }
  return null;
}
function latin1(u8: Uint8Array, a: number, b: number): string {
  let s = ""; for (let i = a; i < b; i++) s += String.fromCharCode(u8[i]); return s;
}
function decPdfBytes(bytes: number[]): string {
  let s = "";
  for (const b of bytes) {
    if (b >= 0x20 && b <= 0x7e) s += String.fromCharCode(b);
    else if (b >= 0xe0 && b <= 0xfa) s += String.fromCharCode(0x05d0 + (b - 0xe0));
    else if (b === 9 || b === 10 || b === 13) s += " ";
  }
  return s;
}
function pdfLiteralBytes(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === "\\") {
      const n = str[i + 1];
      if (n === "n") { out.push(10); i++; }
      else if (n === "r") { out.push(13); i++; }
      else if (n === "t") { out.push(9); i++; }
      else if (n === "(" || n === ")" || n === "\\") { out.push(n.charCodeAt(0)); i++; }
      else if (n >= "0" && n <= "7") {
        let oct = n; i++;
        for (let k = 0; k < 2 && str[i + 1] >= "0" && str[i + 1] <= "7"; k++) { oct += str[i + 1]; i++; }
        out.push(parseInt(oct, 8) & 0xff);
      } else { i++; out.push((n || "").charCodeAt(0) || 32); }
    } else out.push(c.charCodeAt(0) & 0xff);
  }
  return out;
}
function extractContentText(cs: string): string {
  let out = "", i = 0; const n = cs.length;
  while (i < n) {
    const c = cs[i];
    if (c === "(") {
      let j = i + 1, depth = 1, raw = "";
      while (j < n && depth > 0) {
        const ch = cs[j];
        if (ch === "\\") { raw += ch + (cs[j + 1] || ""); j += 2; continue; }
        if (ch === "(") depth++;
        else if (ch === ")") { depth--; if (depth === 0) break; }
        raw += ch; j++;
      }
      out += decPdfBytes(pdfLiteralBytes(raw)); i = j + 1; continue;
    }
    if (c === "<" && cs[i + 1] !== "<") {
      let j = i + 1, hex = "";
      while (j < n && cs[j] !== ">") { hex += cs[j]; j++; }
      const bytes: number[] = [];
      hex.replace(/[^0-9a-fA-F]/g, "").replace(/../g, (h) => { bytes.push(parseInt(h, 16)); return ""; });
      out += decPdfBytes(bytes); i = j + 1; continue;
    }
    if (cs.startsWith("T*", i) || cs.startsWith("Td", i) || cs.startsWith("TD", i)) { out += "\n"; i += 2; continue; }
    if (c === "'" || c === '"') { out += "\n"; i++; continue; }
    i++;
  }
  return out;
}
export async function pdfToText(ab: ArrayBuffer): Promise<string> {
  const u8 = new Uint8Array(ab), bin = latin1(u8, 0, u8.length);
  let text = "";
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bin))) {
    const ds = bin.lastIndexOf("<<", m.index), dict = ds >= 0 ? bin.slice(ds, m.index) : "";
    const dataStart = m.index + m[0].length, end = bin.indexOf("endstream", dataStart);
    if (end < 0) break;
    let e2 = end; while (e2 > dataStart && (u8[e2 - 1] === 10 || u8[e2 - 1] === 13)) e2--;
    const raw = u8.subarray(dataStart, e2);
    let decoded: Uint8Array | null = null;
    if (/FlateDecode/.test(dict)) decoded = await inflateZlib(raw);
    else if (/\/Filter/.test(dict)) { re.lastIndex = end + 9; continue; }
    else decoded = raw;
    if (decoded) {
      const cs = latin1(decoded, 0, decoded.length);
      if (/BT|Tj|TJ/.test(cs)) text += extractContentText(cs) + "\n";
    }
    re.lastIndex = end + 9;
  }
  return text.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();
}
function textToRows(text: string): Rows {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\s+/));
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
  if (ext === "pdf") {
    const rows = textToRows(await pdfToText(buffer));
    return { rows, extracted: rows.length ? extractByType(documentType, rows) : [], kind: rows.length ? "pdf" : "unsupported" };
  }
  // images / xls (scanned or legacy): OCR / conversion is a later stage
  return { rows: [], extracted: [], kind: "unsupported" };
}
