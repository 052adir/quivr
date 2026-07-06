"use client";

import * as XLSX from "xlsx";
import type { DailyEntry } from "./domain/types";

// Export the daily journal to a real .xlsx file (Hebrew headers).
export function exportJournalXlsx(entries: DailyEntry[]) {
  const rows = entries.map((e) => ({
    "תאריך": e.date,
    "יום": e.weekday ?? "",
    "תאריך עברי": e.hebrew_date ?? "",
    "אירוע": e.event ?? "",
    "מחזור": e.revenue ?? "",
    "עסקאות": e.transactions ?? "",
    "ממוצע הזמנה": e.avg_order ?? "",
    "משלוחים": e.deliveries ?? "",
    "איסוף עצמי": e.pickup ?? "",
    "ישיבה במקום": e.dine_in ?? "",
    "מזומן": e.cash_received ?? "",
    "אשראי/קופה": e.credit_received ?? "",
    "תן ביס/סיבוס": e.tenbis_sibus ?? "",
    "וולט/משלוחה": e.wolt_mishloha ?? "",
    "אחר": e.other_payment ?? "",
    "סה״כ אמצעי תשלום": e.total_payments ?? "",
    "הפרש מול מחזור": e.revenue_difference ?? "",
    "הופקד": e.cash_deposited ?? "",
    "מזומן להפקדה": e.cash_to_deposit ?? "",
    "הערות": e.notes ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "יומן עסקי");
  XLSX.writeFile(wb, `פרגו-יומן-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
