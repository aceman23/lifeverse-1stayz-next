"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CalendarCheck, Check, ChevronDown, Info, LogOut, Menu, MessageSquare, Settings, ShieldAlert } from "lucide-react";
import { getRouteMeta } from "@/config/navigation";
import { NOTIFICATIONS } from "@/data/notifications";
import { CURRENT_USER } from "@/data/staff";
import type { Notification, WorkspaceMode } from "@/data/types";
import { MODE_COPY } from "@/data/workspace";
import { useDismiss } from "@/hooks/useDismiss";
import { signOut } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace-context";
import Avatar from "../ui/Avatar";
import { MODE_BADGE } from "../ui/StatusBadge";

type OpenMenu = "mode" | "notifications" | "user" | null;

const MODE_DOT: Record<WorkspaceMode, string> = { setup: "bg-ink-3", shadow: "bg-warning", live: "bg-success" };

const NOTIFICATION_ICON: Record<Notification["kind"], { icon: typeof Bell; className: string }> = {
  escalation: { icon: ShieldAlert, className: "bg-danger-tint text-danger" },
  reply: { icon: MessageSquare, className: "bg-[#E8F4F2] text-teal" },
  booking: { icon: CalendarCheck, className: "bg-warning-tint text-warning" },
  system: { icon: Info, className: "bg-info-tint text-info" },
};

export default function Header({ onOpenMenu, menuOpen }: { onOpenMenu: () => void; menuOpen: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const meta = getRouteMeta(pathname);
  const { mode, setMode } = useWorkspace();
  const [open, setOpen] = useState<OpenMenu>(null);
  const [notifications, setNotifications] = useState(NOTIFICATIONS);
  const [signingOut, setSigningOut] = useState(false);
  const menusRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(null), []);
  useDismiss(menusRef, open !== null, close);
  const toggle = (menu: Exclude<OpenMenu, null>) => setOpen((cur) => (cur === menu ? null : menu));

  const unread = notifications.filter((n) => !n.read).length;

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="flex h-16 items-center gap-3 px-4 md:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          aria-controls="app-sidebar"
          aria-expanded={menuOpen}
          className="-ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-bg hover:text-ink md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[13px] font-semibold tracking-[0.08em] text-ink uppercase">{meta.title}</h1>
          <p className="hidden truncate text-xs text-ink-2 sm:block">{meta.subtitle}</p>
        </div>

        <div ref={menusRef} className="flex shrink-0 items-center gap-1 sm:gap-2">
          {/* Mode */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggle("mode")}
              aria-haspopup="menu"
              aria-expanded={open === "mode"}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface pr-2 pl-2.5 text-xs font-medium text-ink transition-colors hover:bg-bg"
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", MODE_DOT[mode], mode === "live" && "animate-pulse")} aria-hidden="true" />
              <span className="hidden sm:inline">{MODE_BADGE[mode].label} mode</span>
              <span className="sm:hidden">{MODE_BADGE[mode].label}</span>
              <ChevronDown className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
            </button>
            {open === "mode" && (
              <div role="menu" className="animate-pop-in absolute right-0 mt-2 w-72 max-w-[calc(100vw-32px)] rounded-xl border border-line bg-surface p-1.5 shadow-pop">
                {(Object.keys(MODE_COPY) as WorkspaceMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === m}
                    onClick={() => {
                      setMode(m);
                      close();
                    }}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-bg"
                  >
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", MODE_DOT[m])} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{MODE_COPY[m].label}</span>
                      <span className="block text-xs leading-relaxed text-ink-2">{MODE_COPY[m].description}</span>
                    </span>
                    {mode === m && <Check className="mt-1 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="sm:relative">
            <button
              type="button"
              onClick={() => toggle("notifications")}
              aria-haspopup="true"
              aria-expanded={open === "notifications"}
              aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-bg hover:text-ink"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unread > 0 && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" aria-hidden="true" />
              )}
            </button>
            {open === "notifications" && (
              <div className="animate-pop-in absolute inset-x-4 mt-2 rounded-xl border border-line bg-surface shadow-pop sm:inset-x-auto sm:right-0 sm:w-96">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <p className="text-sm font-semibold text-ink">Notifications</p>
                  {unread > 0 && (
                    <button
                      type="button"
                      onClick={() => setNotifications((ns) => ns.map((n) => ({ ...n, read: true })))}
                      className="text-xs font-medium text-teal-text hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
                  {notifications.map((n) => {
                    const { icon: Icon, className } = NOTIFICATION_ICON[n.kind];
                    return (
                      <li key={n.id}>
                        <Link
                          href={n.href}
                          onClick={() => {
                            setNotifications((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                            close();
                          }}
                          className="flex gap-3 px-4 py-3 transition-colors hover:bg-bg"
                        >
                          <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full", className)}>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className={cn("truncate text-sm text-ink", !n.read && "font-semibold")}>{n.title}</span>
                              <span className="shrink-0 text-[11px] text-ink-3">{formatRelative(n.at)}</span>
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-ink-2">{n.body}</span>
                          </span>
                          {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-teal" aria-label="Unread" />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* User */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggle("user")}
              aria-haspopup="menu"
              aria-expanded={open === "user"}
              aria-label={`Account menu for ${CURRENT_USER.name}`}
              className="inline-flex items-center gap-1 rounded-full p-0.5 transition-colors hover:bg-bg sm:pr-1.5"
            >
              <Avatar name={CURRENT_USER.name} size="md" className="bg-ink text-white" />
              <ChevronDown className="hidden h-3.5 w-3.5 text-ink-3 sm:block" aria-hidden="true" />
            </button>
            {open === "user" && (
              <div role="menu" className="animate-pop-in absolute right-0 mt-2 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-pop">
                <div className="px-3 py-2.5">
                  <p className="truncate text-sm font-medium text-ink">{CURRENT_USER.name}</p>
                  <p className="truncate text-xs text-ink-2">{CURRENT_USER.email}</p>
                </div>
                <div className="my-1 h-px bg-line" />
                <Link
                  href="/settings"
                  role="menuitem"
                  onClick={close}
                  className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm text-ink transition-colors hover:bg-bg"
                >
                  <Settings className="h-4 w-4 text-ink-3" aria-hidden="true" />
                  Settings
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-danger transition-colors hover:bg-danger-tint disabled:opacity-60"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
