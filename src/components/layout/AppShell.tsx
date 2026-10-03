"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { cn } from "@/lib/cn";
import { ToastProvider } from "../ui/Toast";
import Header from "./Header";
import Sidebar from "./Sidebar";

const DESKTOP_QUERY = "(min-width: 768px)";
const COLLAPSED_KEY = "1stayz:sidebar-collapsed";
const COLLAPSED_EVENT = "1stayz:sidebar-collapsed";

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const getDesktop = () => window.matchMedia(DESKTOP_QUERY).matches;

// Desktop collapse preference, persisted per browser.
function subscribeCollapsed(onChange: () => void) {
  window.addEventListener(COLLAPSED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
function getCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}
function setCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {}
  window.dispatchEvent(new Event(COLLAPSED_EVENT));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  // Mobile: off-canvas drawer. Desktop (md+): docked sidebar that can be collapsed.
  const [menuOpen, setMenuOpen] = useState(false);
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktop, () => false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsed, () => false);
  // The drawer is a mobile-only concept; ignore it once the viewport is desktop-sized.
  const drawerOpen = menuOpen && !isDesktop;

  // While the mobile drawer is open: lock page scroll and close on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  function toggleMenu() {
    if (isDesktop) setCollapsed(!collapsed);
    else setMenuOpen(!drawerOpen);
  }

  return (
    <WorkspaceProvider>
      <ToastProvider>
      <div className="app-shell min-h-screen overflow-x-clip bg-bg text-ink">
        <Sidebar open={drawerOpen} collapsed={collapsed} onClose={() => setMenuOpen(false)} />
        <div
          className={cn(
            "flex min-h-screen min-w-0 flex-col transition-[padding] duration-200 ease-out",
            collapsed ? "md:pl-0" : "md:pl-56",
          )}
        >
          <Header onToggleMenu={toggleMenu} menuOpen={isDesktop ? !collapsed : drawerOpen} />
          <main className="mx-auto w-full max-w-[1280px] min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
      </ToastProvider>
    </WorkspaceProvider>
  );
}
