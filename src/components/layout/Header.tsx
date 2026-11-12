"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CalendarCheck, Check, ChevronDown, Info, Lock, LogOut, Menu, MessageSquare, Pencil, Settings, ShieldAlert, Sun } from "lucide-react";
import { getRouteMeta } from "@/config/navigation";
import { NOTIFICATIONS } from "@/data/notifications";
import { CURRENT_USER } from "@/data/staff";
import type { Notification, WorkspaceMode } from "@/data/types";
import { MODE_COPY } from "@/data/workspace";
import { useDismiss } from "@/hooks/useDismiss";
import { signOut } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import type { ChurchMode } from "@/lib/church/types";
import { useWorkspace } from "@/lib/workspace-context";
import EditNameDialog from "../account/EditNameDialog";
import Avatar from "../ui/Avatar";
import { MODE_BADGE } from "../ui/StatusBadge";
import { useToast } from "../ui/Toast";

type OpenMenu = "mode" | "notifications" | "user" | null;

const MODE_DOT: Record<WorkspaceMode, string> = { setup: "bg-ink-3", shadow: "bg-warning", live: "bg-success" };

/** Setup only exists before onboarding step 8, so the app offers just these. */
const SELECTABLE_MODES: ChurchMode[] = ["shadow", "live"];

const NOTIFICATION_ICON: Record<Notification["kind"], { icon: typeof Bell; className: string }> = {
  escalation: { icon: ShieldAlert, className: "bg-danger-tint text-danger" },
  reply: { icon: MessageSquare, className: "bg-[#E8F4F2] text-teal" },
  booking: { icon: CalendarCheck, className: "bg-warning-tint text-warning" },
  system: { icon: Info, className: "bg-info-tint text-info" },
};

export default function Header({ onToggleMenu, menuOpen }: { onToggleMenu: () => void; menuOpen: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const meta = getRouteMeta(pathname);
  const { mode, setMode, liveBlockedReason, user: signedIn, demo, actionCount } = useWorkspace();
  // The demo has no account: it shows its sample pastor.
  const user = signedIn ?? { name: CURRENT_USER.name, email: CURRENT_USER.email };
  const toast = useToast();
  const [open, setOpen] = useState<OpenMenu>(null);
  // Sample notifications are for the demo only. A real church's alerts, escalations and drafts
  // are on Today; the bell points there with the same count as the sidebar badge.
  const [notifications, setNotifications] = useState(demo ? NOTIFICATIONS : []);
  const [signingOut, setSigningOut] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const menusRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(null), []);
  useDismiss(menusRef, open !== null, close);
  const toggle = (menu: Exclude<OpenMenu, null>) => setOpen((cur) => (cur === menu ? null : menu));

  const unread = demo ? notifications.filter((n) => !n.read).length : actionCount;

  async function chooseMode(next: ChurchMode) {
    if (next === "live" && mode !== "live" && liveBlockedReason) return;
    close();
    const error = await setMode(next);
    if (error) toast(error, { tone: "danger" });
    else if (next !== mode) toast(`Switched to ${MODE_COPY[next].label} mode.`);
  }

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
          onClick={onToggleMenu}
          aria-label={menuOpen ? "Hide menu" : "Show menu"}
          aria-controls="app-sidebar"
          aria-expanded={menuOpen}
          className="-ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-bg hover:text-ink"
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
                {SELECTABLE_MODES.map((m) => {
                  const locked = m === "live" && mode !== "live" && liveBlockedReason !== null;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="menuitemradio"
                      aria-checked={mode === m}
                      aria-disabled={locked}
                      onClick={() => chooseMode(m)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        locked ? "cursor-not-allowed" : "hover:bg-bg",
                      )}
                    >
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", MODE_DOT[m], locked && "opacity-40")} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm font-medium", locked ? "text-ink-3" : "text-ink")}>{MODE_COPY[m].label}</span>
                        <span className="block text-xs leading-relaxed text-ink-2">{locked ? liveBlockedReason : MODE_COPY[m].description}</span>
                      </span>
                      {mode === m && <Check className="mt-1 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />}
                      {locked && <Lock className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />}
                    </button>
                  );
                })}
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
                  {demo && unread > 0 && (
                    <button
                      type="button"
                      onClick={() => setNotifications((ns) => ns.map((n) => ({ ...n, read: true })))}
                      className="text-xs font-medium text-teal-text hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                {!demo && (
                  <Link
                    href="/today"
                    onClick={close}
                    className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-bg"
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal/10 text-teal">
                      <Sun className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">
                        {actionCount > 0 ? `${actionCount} ${actionCount === 1 ? "thing needs" : "things need"} you on Today` : "You're all caught up"}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-2">
                        Escalations, drafts to approve, replies and alerts. Escalations also come by email and text.
                      </span>
                    </span>
                  </Link>
                )}
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
              aria-label={`Account menu for ${user.name}`}
              className="inline-flex items-center gap-1 rounded-full p-0.5 transition-colors hover:bg-bg sm:pr-1.5"
            >
              <Avatar name={user.name} size="md" className="bg-ink text-white" />
              <ChevronDown className="hidden h-3.5 w-3.5 text-ink-3 sm:block" aria-hidden="true" />
            </button>
            {open === "user" && (
              <div role="menu" className="animate-pop-in absolute right-0 mt-2 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-pop">
                <div className="px-3 py-2.5">
                  <p className="truncate text-sm font-medium text-ink">{user.name}</p>
                  {user.email && <p className="truncate text-xs text-ink-2">{user.email}</p>}
                </div>
                <div className="my-1 h-px bg-line" />
                {signedIn && !demo && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      setEditingName(true);
                    }}
                    className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-ink transition-colors hover:bg-bg"
                  >
                    <Pencil className="h-4 w-4 text-ink-3" aria-hidden="true" />
                    Edit name
                  </button>
                )}
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
            {signedIn && !demo && editingName && <EditNameDialog onClose={() => setEditingName(false)} currentName={signedIn.name} />}
          </div>
        </div>
      </div>
    </header>
  );
}
