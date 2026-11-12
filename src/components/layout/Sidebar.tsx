"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronUp, LogOut, Pencil, Settings, X } from "lucide-react";
import { NAV_ITEMS, isActivePath } from "@/config/navigation";
import { CURRENT_USER } from "@/data/staff";
import { signOut } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace-context";
import { cn } from "@/lib/cn";
import Avatar from "@/components/ui/Avatar";
import EditNameDialog from "@/components/account/EditNameDialog";

interface SidebarProps {
  /** Mobile drawer state. */
  open: boolean;
  /** Desktop (md+) state: when true the docked sidebar slides away. */
  collapsed: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, collapsed, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { actionCount, demo } = useWorkspace();

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        id="app-sidebar"
        aria-label="Main navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-ink text-white transition-[translate,visibility] duration-200 ease-out",
          // `invisible` keeps the closed drawer out of the tab order; visibility flips after the slide.
          open ? "visible translate-x-0 shadow-pop md:shadow-none" : "invisible -translate-x-full",
          collapsed ? "md:invisible md:-translate-x-full" : "md:visible md:translate-x-0",
        )}
      >
        <div className="flex h-[72px] items-center justify-between px-5">
          <Link href="/today" onClick={onClose} aria-label="1Stayz home">
            <Image
              src="/icons/ic_1stayz.png"
              alt="1Stayz"
              width={110}
              height={36}
              preload
              className="h-8 w-auto object-contain brightness-0 invert"
            />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="-mr-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <ul className="space-y-1">
            {NAV_ITEMS.map(({ to, icon: Icon, label, soon: unfinished, sampleOnly }) => {
              const soon = unfinished || (sampleOnly && !demo);
              const active = isActivePath(pathname, to);
              const badge = to === "/today" && actionCount > 0 ? actionCount : null;
              return (
                <li key={to}>
                  <Link
                    href={to}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex h-11 items-center gap-3.5 rounded-xl px-3.5 text-[15px] transition-colors",
                      active
                        ? "bg-teal font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                        : "text-white/75 hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    <Icon
                      className={cn("h-5 w-5 shrink-0", active ? "text-white" : "text-white/55 group-hover:text-white/85")}
                      strokeWidth={active ? 2.25 : 2}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {badge !== null && (
                      <span
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white tabular-nums"
                        aria-label={`${badge} need attention`}
                      >
                        {badge}
                      </span>
                    )}
                    {soon && (
                      <span className="shrink-0 rounded-full border border-white/15 px-1.5 py-px text-[9px] font-medium tracking-wide text-white/50 uppercase">
                        Soon
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <AccountCard onNavigate={onClose} />
        <p className="px-5 pb-4 font-mono text-[10px] text-white/35">
          1Stayz by Lifeverse · v{process.env.NEXT_PUBLIC_APP_VERSION}
        </p>
      </aside>
    </>
  );
}

/** Who's signed in and for which church, with a small menu (Edit name, Settings, Sign out). */
function AccountCard({ onNavigate }: { onNavigate: () => void }) {
  const router = useRouter();
  const { user: signedIn, churchName, demo } = useWorkspace();
  const user = signedIn ?? { name: CURRENT_USER.name, email: CURRENT_USER.email };
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative mx-3 mb-2 border-t border-white/10 pt-3">
      {menuOpen && (
        <div role="menu" className="animate-pop-in absolute right-0 bottom-full left-0 mb-2 rounded-xl border border-line bg-surface p-1.5 text-ink shadow-pop">
          {user.email && <p className="truncate px-3 pt-1.5 pb-2 text-xs text-ink-2">{user.email}</p>}
          {signedIn && !demo && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setEditingName(true);
              }}
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm transition-colors hover:bg-bg"
            >
              <Pencil className="h-4 w-4 text-ink-3" aria-hidden="true" />
              Edit name
            </button>
          )}
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onNavigate();
            }}
            className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors hover:bg-bg"
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
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Account menu for ${user.name}`}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
      >
        <Avatar name={user.name} size="md" className="bg-white/15 text-white" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">{user.name}</span>
          {churchName && <span className="block truncate text-xs text-white/55">{churchName}</span>}
        </span>
        <ChevronUp className={cn("h-4 w-4 shrink-0 text-white/50 transition-transform", !menuOpen && "rotate-180")} aria-hidden="true" />
      </button>
      {signedIn && !demo && editingName && <EditNameDialog onClose={() => setEditingName(false)} currentName={signedIn.name} />}
    </div>
  );
}
