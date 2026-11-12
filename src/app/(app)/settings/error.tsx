"use client";

import { AlertTriangle } from "lucide-react";
import Button from "@/components/ui/Button";

// Supabase couldn't be read. Never show a blank form here: saving it would overwrite real data.
export default function SettingsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-xl border border-line bg-surface px-6 py-12 text-center shadow-card">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-danger-tint text-danger">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-medium text-ink">Couldn&rsquo;t load your settings</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-2">Check your connection, then try again. Nothing was changed.</p>
      <Button variant="secondary" className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
