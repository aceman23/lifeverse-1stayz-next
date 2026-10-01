"use client";

import { useEffect, useState } from "react";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { ToastProvider } from "../ui/Toast";
import Header from "./Header";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  // While the mobile drawer is open: lock page scroll and close on Escape.
  useEffect(() => {
    if (!menuOpen) return;
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
  }, [menuOpen]);

  return (
    <WorkspaceProvider>
      <ToastProvider>
      <div className="app-shell min-h-screen overflow-x-clip bg-bg text-ink">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="flex min-h-screen min-w-0 flex-col md:pl-56">
          <Header onOpenMenu={() => setMenuOpen(true)} menuOpen={menuOpen} />
          <main className="mx-auto w-full max-w-[1280px] min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
      </ToastProvider>
    </WorkspaceProvider>
  );
}
