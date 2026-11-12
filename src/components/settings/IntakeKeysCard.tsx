"use client";

import { useId, useState, useSyncExternalStore, useTransition } from "react";
import { Check, Copy, KeyRound, Plus, TriangleAlert } from "lucide-react";
import { createIntakeKey, revokeIntakeKey } from "@/lib/church/actions";
import type { IntakeKey } from "@/lib/church/types";
import { cn } from "@/lib/cn";
import { formatTimestamp } from "@/lib/onboarding/message";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";

// Intake keys let Subsplash (via Zapier or Make), a kiosk or a website form send guests to
// POST /api/intake. The full key is shown once, right after it's created; afterwards only
// its prefix is visible.

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked: the text is selectable on screen.
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export default function IntakeKeysCard({ keys, isOwner, demo }: { keys: IntakeKey[]; isOwner: boolean; demo: boolean }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("Subsplash");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const labelId = useId();
  // The site's own address (server render: a relative path until hydration).
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const endpoint = `${origin}/api/intake`;

  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);
  const canManage = isOwner && !demo;

  function create(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createIntakeKey(label).catch(() => ({ ok: false as const, error: "Couldn't create the key. Try again." }));
      if (!result.ok) {
        toast(result.error, { tone: "danger" });
        return;
      }
      setNewKey(result.data.key);
      setLabel("Subsplash");
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      const result = await revokeIntakeKey(id).catch(() => ({ ok: false as const, error: "Couldn't revoke the key. Try again." }));
      setConfirmRevoke(null);
      if (result.ok) toast("Key revoked. Anything still using it is refused from now on.");
      else toast(result.error, { tone: "danger" });
    });
  }

  const example = `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ${newKey ?? "isk_…"}" \\
  -H "Content-Type: application/json" \\
  -d '{"source":"subsplash","submission_id":"<form entry id>","first_name":"Jordan","phone":"(217) 555-0100","sms_consent":true}'`;

  return (
    <Card
      title="Intake keys"
      icon={KeyRound}
      description="Subsplash (through Zapier or Make), a kiosk or your website send new guests to 1Stayz with one of these keys."
      delay={120}
    >
      <div className="rounded-lg bg-bg px-3 py-2 text-xs text-ink-2">
        <span className="font-medium text-ink">Endpoint</span> <code className="font-mono break-all">POST {endpoint}</code>
      </div>

      {newKey && (
        <div role="alert" className="animate-fade-in mt-4 rounded-lg border border-warning/40 bg-warning-tint p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <TriangleAlert className="h-4 w-4 text-warning" aria-hidden="true" />
            Copy this key now. It won&rsquo;t be shown again.
          </p>
          <code className="mt-2 block rounded-md bg-surface px-3 py-2 font-mono text-xs break-all text-ink select-all">{newKey}</code>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton text={newKey} label="Copy key" />
            <CopyButton text={example} label="Copy example request" />
            <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>
              I&rsquo;ve saved it
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-ink-2">Store it in Zapier or Make as a secret. Anyone with it can add guests to your church.</p>
        </div>
      )}

      <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
        {active.length === 0 && <li className="px-4 py-3 text-sm text-ink-3">No active keys.</li>}
        {active.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {k.label} <code className="ml-1 font-mono text-xs text-ink-3">{k.prefix}…</code>
              </p>
              <p className="text-xs text-ink-3">
                Created {formatTimestamp(k.createdAt)} · {k.lastUsedAt ? `last used ${formatTimestamp(k.lastUsedAt)}` : "never used"}
              </p>
            </div>
            {canManage &&
              (confirmRevoke === k.id ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-ink-2">Revoke?</span>
                  <Button size="sm" variant="danger" disabled={pending} onClick={() => revoke(k.id)}>
                    Revoke
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRevoke(null)}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmRevoke(k.id)}>
                  Revoke
                </Button>
              ))}
          </li>
        ))}
        {revoked.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3 opacity-60">
            <p className="min-w-0 flex-1 text-sm text-ink-2">
              {k.label} <code className="ml-1 font-mono text-xs">{k.prefix}…</code>
            </p>
            <StatusBadge tone="neutral">Revoked</StatusBadge>
          </li>
        ))}
      </ul>

      {canManage ? (
        <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={labelId} className="text-xs font-medium text-ink-2">
              Label
            </label>
            <input
              id={labelId}
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Subsplash connection card"
              className="mt-1.5 h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-teal"
            />
          </div>
          <Button type="submit" size="sm" variant="primary" disabled={pending || active.length >= 5} className={cn("h-9")}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Create key
          </Button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-ink-3">{demo ? "Keys can't be created in the demo workspace." : "Only the church owner can create or revoke keys."}</p>
      )}
    </Card>
  );
}
