"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-reads the page's server data every `ms` while the tab is visible, so a new escalation
 * shows up within a minute (pilot plan P11). Off in the demo.
 */
export function useAutoRefresh(enabled: boolean, ms = 20_000) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, ms, router]);
}

/**
 * The current time, starting from the server's read time (so the first render matches) and
 * then ticking every `ms`. The demo stays on its fixed clock.
 */
export function useNow(serverNow: string, live: boolean, ms = 1000) {
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(id);
  }, [live, ms]);
  return now;
}
