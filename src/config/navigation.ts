import {
  BarChart3,
  CalendarDays,
  House,
  MessageCircle,
  Send,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Unfinished page; shows a "Soon" pill in the sidebar. */
  soon?: boolean;
  /**
   * Still built on sample data: the demo workspace shows it, a real church gets a "coming soon"
   * page and a "Soon" pill (so no church ever sees invented guests).
   */
  sampleOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/today", icon: House, label: "Today" },
  { to: "/", icon: TrendingUp, label: "Progress" },
  { to: "/people", icon: Users, label: "Guests" },
  { to: "/conversations", icon: MessageCircle, label: "Conversations" },
  { to: "/ai-training", icon: Sparkles, label: "Train Your AI" },
  { to: "/follow-up-engine", icon: Send, label: "Sequences", sampleOnly: true },
  { to: "/appointments", icon: CalendarDays, label: "Appointments", sampleOnly: true },
  { to: "/insights", icon: BarChart3, label: "Insights" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export interface RouteMeta {
  title: string;
  subtitle: string;
}

// Header copy per route. Nested paths (e.g. /people/:id) fall back to their parent.
export const ROUTE_META: Record<string, RouteMeta> = {
  "/today": { title: "Today", subtitle: "Your prioritized action list" },
  "/": { title: "Progress", subtitle: "System overview of your visitor engagement" },
  "/people": { title: "Guests", subtitle: "Every guest and their journey" },
  "/conversations": { title: "Conversations", subtitle: "AI-powered chats across every channel" },
  "/ai-training": { title: "Train Your AI", subtitle: "Documents, guardrails, and tone" },
  "/follow-up-engine": { title: "Sequences", subtitle: "Automated sequences that shepherd every visitor" },
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
