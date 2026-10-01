"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { NAV_ITEMS, isActivePath } from "@/config/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { cn } from "@/lib/cn";

interface SidebarProps {
  /** Mobile drawer state. The sidebar is always visible from md up. */
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { actionCount } = useWorkspace();

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
          "fixed inset-y-0 left-0 z-50 flex w-56 flex-col bg-ink text-white transition-[translate,visibility] duration-200 ease-out",
          "md:visible md:translate-x-0",
          // `invisible` keeps the closed drawer out of the tab order; visibility flips after the slide.
          open ? "visible translate-x-0 shadow-pop md:shadow-none" : "invisible -translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/today" onClick={onClose} aria-label="1Stayz home">
            <Image
              src="/icons/ic_1stayz.png"
              alt="1Stayz"
              width={98}
              height={32}
              preload
              className="h-7 w-auto object-contain brightness-0 invert"
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
          <ul className="space-y-0.5">
            {NAV_ITEMS.map(({ to, icon: Icon, label, soon }) => {
              const active = isActivePath(pathname, to);
              const badge = to === "/today" && actionCount > 0 ? actionCount : null;
              return (
                <li key={to}>
                  <Link
                    href={to}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                      active ? "bg-white/[0.08] font-medium text-white" : "text-white/70 hover:bg-white/[0.04] hover:text-white",
                    )}
                  >
                    <Icon
                      className={cn("h-[18px] w-[18px] shrink-0", active ? "text-teal" : "text-white/50 group-hover:text-white/80")}
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
                      <span className="rounded-full border border-white/15 px-1.5 py-px text-[10px] font-medium tracking-wide text-white/50 uppercase">
                        Soon
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-xs text-white/60">1Stayz by Lifeverse</p>
          <p className="mt-0.5 font-mono text-[10px] text-white/35">v{process.env.NEXT_PUBLIC_APP_VERSION}</p>
        </div>
      </aside>
    </>
  );
}
