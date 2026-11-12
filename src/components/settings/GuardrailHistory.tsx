"use client";

import { useState } from "react";
import { History, Minus, Pencil, Plus } from "lucide-react";
import type { GuardrailHistoryEntry } from "@/lib/church/types";
import { cn } from "@/lib/cn";
import { formatTimestamp } from "@/lib/onboarding/message";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";

// AI-06: every approved guardrail version, newest first, with what changed from the one before.
// The assistant always uses the newest; each reply records the version it was written under.

const ICON = { added: Plus, removed: Minus, changed: Pencil } as const;
const TONE = { added: "text-success", removed: "text-danger", changed: "text-warning" } as const;
const WORD = { added: "Added", removed: "Removed", changed: "Changed" } as const;

export default function GuardrailHistory({ history }: { history: GuardrailHistoryEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? history : history.slice(0, 3);
  return (
    <Card title="Version history" icon={History} description="Each approval saves a version. The assistant always uses the newest.">
      <div className="px-5 pt-3 pb-5">
        {history.length === 0 ? (
          <p className="text-sm text-ink-2">No approved version yet. Once your pastor approves the guardrails, each version appears here.</p>
        ) : (
          <ol className="space-y-4">
            {shown.map((v, i) => (
              <li key={v.version} className={cn("rounded-lg border border-line p-3.5", i === 0 && "border-teal/40 bg-teal/5")}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink">Version {v.version}</p>
                  {i === 0 && <StatusBadge tone="success">In use</StatusBadge>}
                  {v.first && v.changes.length > 0 && <span className="text-xs text-ink-3">First version</span>}
                  <p className="text-xs text-ink-2">
                    Approved{v.approvedBy ? ` by ${v.approvedBy}` : ""} on {formatTimestamp(v.approvedAt)}
                  </p>
                </div>
                {v.changes.length === 0 ? (
                  <p className="mt-2 text-xs text-ink-3">{v.first ? "The first approved version." : "Approved again with no changes."}</p>
                ) : (
                  <ul className="mt-2.5 space-y-1.5" aria-label={`What changed in version ${v.version}`}>
                    {v.changes.map((c, j) => {
                      const Icon = ICON[c.kind];
                      return (
                        <li key={j} className="flex gap-2 text-xs leading-relaxed text-ink">
                          <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", TONE[c.kind])} aria-label={WORD[c.kind]} />
                          <span>
                            <span className="text-ink-2">{c.area}:</span> {c.text}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
        {history.length > 3 && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 text-xs font-medium text-teal-text hover:underline">
            {showAll ? "Show fewer" : `Show all ${history.length} versions`}
          </button>
        )}
      </div>
    </Card>
  );
}
