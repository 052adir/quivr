import {
  LayoutDashboard, NotebookPen, Banknote, CalendarDays, ListChecks, Target,
  Utensils, BarChart3, Users, Mail, Receipt, Sparkles, Settings, TrendingUp,
  TrendingDown, TriangleAlert, Calendar, CircleAlert, Check, Plus, Trash2,
  Pencil, X, ChevronLeft, Menu, LogOut, ArrowUp, ArrowDown, Send, Download,
  RefreshCw, Search, Phone, MapPin, Clock, FileUp, type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  "notebook-pen": NotebookPen,
  banknote: Banknote,
  "calendar-days": CalendarDays,
  "list-checks": ListChecks,
  target: Target,
  utensils: Utensils,
  "bar-chart-3": BarChart3,
  users: Users,
  mail: Mail,
  receipt: Receipt,
  sparkles: Sparkles,
  settings: Settings,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  "alert-triangle": TriangleAlert,
  calendar: Calendar,
  "circle-alert": CircleAlert,
  check: Check,
  plus: Plus,
  "trash-2": Trash2,
  pencil: Pencil,
  x: X,
  "chevron-left": ChevronLeft,
  menu: Menu,
  "log-out": LogOut,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  send: Send,
  download: Download,
  "refresh-cw": RefreshCw,
  search: Search,
  phone: Phone,
  "map-pin": MapPin,
  clock: Clock,
  "file-up": FileUp,
};

export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const C = MAP[name] ?? CircleAlert;
  return <C size={size} className={className} aria-hidden />;
}
