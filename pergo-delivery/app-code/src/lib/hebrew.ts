// Hebrew calendar helpers — computed locally via Intl (no dependency, offline).

const HE_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function weekdayHe(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00");
  return HE_WEEKDAYS[d.getDay()];
}

export function hebrewDate(dateISO: string): string {
  try {
    const d = new Date(dateISO + "T00:00:00");
    return new Intl.DateTimeFormat("he-u-ca-hebrew", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return "";
  }
}

export const WEEKDAYS = HE_WEEKDAYS;
