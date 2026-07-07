// Navigation model. `ready` screens are built; `soon` are future modules whose
// architecture exists (tables/registry) but UI is intentionally minimal.

export interface NavItem {
  href: string;
  label: string;
  icon: string; // lucide icon name
  ready: boolean;
  group: "core" | "future";
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "דשבורד", icon: "layout-dashboard", ready: true, group: "core" },
  { href: "/journal", label: "יומן יומי", icon: "notebook-pen", ready: true, group: "core" },
  { href: "/cashflow", label: "תזרים והפקדות", icon: "banknote", ready: true, group: "core" },
  { href: "/calendar", label: "לוח שנה עסקי", icon: "calendar-days", ready: true, group: "core" },
  { href: "/tasks", label: "משימות", icon: "list-checks", ready: true, group: "core" },
  { href: "/leads", label: "לקוחות פוטנציאליים", icon: "target", ready: true, group: "core" },
  { href: "/menu", label: "תפריט ומנות", icon: "utensils", ready: true, group: "core" },
  { href: "/reports", label: "דוחות", icon: "bar-chart-3", ready: true, group: "core" },
  { href: "/employees", label: "עובדים וסידור", icon: "users", ready: true, group: "future" },
  { href: "/z-report", label: "דוח Z יומי", icon: "mail", ready: true, group: "future" },
  { href: "/documents", label: "ייבוא מסמכים", icon: "file-up", ready: false, group: "future" },
  { href: "/food-cost", label: "פוד קוסט", icon: "receipt", ready: false, group: "future" },
  { href: "/ai", label: "המלצות AI", icon: "sparkles", ready: false, group: "future" },
  { href: "/settings", label: "הגדרות", icon: "settings", ready: true, group: "future" },
];

// Bottom-bar (mobile) shows the 5 most-used core screens.
export const MOBILE_PRIMARY = ["/dashboard", "/journal", "/cashflow", "/tasks", "/calendar"];
