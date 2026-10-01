import {
  BarChart2,
  CalendarDays,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Sparkles,
  Sun,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Unfinished page; shows a "Soon" pill in the sidebar. */
  soon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/today", icon: Sun, label: "Today" },
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/people", icon: Users, label: "People" },
  { to: "/conversations", icon: MessageSquare, label: "Conversations" },
  { to: "/ai-training", icon: Sparkles, label: "AI Training" },
  { to: "/follow-up-engine", icon: Zap, label: "Follow-Up Engine" },
  { to: "/appointments", icon: CalendarDays, label: "Appointments" },
  { to: "/insights", icon: BarChart2, label: "Insights" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export interface RouteMeta {
  title: string;
  subtitle: string;
}

// Header copy per route. Nested paths (e.g. /people/:id) fall back to their parent.
export const ROUTE_META: Record<string, RouteMeta> = {
  "/today": { title: "Today", subtitle: "Your personalized action list" },
  "/": { title: "Dashboard", subtitle: "System overview of your visitor engagement" },
  "/people": { title: "People", subtitle: "Every guest and their journey" },
  "/conversations": { title: "Conversations", subtitle: "AI-powered chats across every channel" },
  "/ai-training": { title: "AI Training", subtitle: "Documents, guardrails, and tone" },
  "/follow-up-engine": { title: "Follow-Up Engine", subtitle: "Automated sequences that shepherd every visitor" },
  "/appointments": { title: "Appointments", subtitle: "Coffee chats and meeting invites" },
  "/insights": { title: "Insights", subtitle: "Weekly metrics and pilot health" },
  "/settings": { title: "Settings", subtitle: "Configure your 1Stayz workspace" },
};

export function getRouteMeta(pathname: string): RouteMeta {
  let path = pathname;
  while (path.length > 1) {
    if (ROUTE_META[path]) return ROUTE_META[path];
    path = path.slice(0, path.lastIndexOf("/")) || "/";
  }
  return ROUTE_META["/"]!;
}

export function isActivePath(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}
