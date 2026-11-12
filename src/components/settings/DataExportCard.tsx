"use client";

import { useState } from "react";
import { Check, FileJson, FileSpreadsheet, Loader2, Lock, ShieldCheck, X, type LucideIcon } from "lucide-react";
import type { LearningConsent } from "@/lib/church/types";
import type { ExportFormat } from "@/lib/church/export";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

// DB-06: Settings > Data. The owner downloads the church's data. The files hold guests' names,
// numbers and messages, so the card says so, and every download is recorded in the audit log.

const DOWNLOADS: { format: ExportFormat; title: string; detail: string; icon: LucideIcon }[] = [
  {
    format: "conversations",
    title: "Conversations",
    detail: "Every text and email with each guest, in order (spreadsheet).",
    icon: FileSpreadsheet,
  },
  {
    format: "people",
    title: "People",
    detail: "Every guest with their contact details, stage and consent (spreadsheet).",
    icon: FileSpreadsheet,
  },
  {
    format: "json",
    title: "Everything",
    detail: "All of your church's data in 1Stayz: settings, guardrails, people, conversations, notes and history (JSON).",
    icon: FileJson,
  },
];

function fileNameFrom(res: Response, fallback: string) {
  const m = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
  return m?.[1] ?? fallback;
}

export default function DataExportCard({ isOwner, demo, consent }: { isOwner: boolean; demo: boolean; consent: LearningConsent }) {
  const toast = useToast();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const canDownload = isOwner && !demo;

  async function download(format: ExportFormat) {
    setBusy(format);
    try {
      const res = await fetch(`/api/settings/export?format=${format}`, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast(body?.error ?? "Couldn't prepare the download. Try again.", { tone: "danger" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameFrom(res, `1stayz-${format}.${format === "json" ? "json" : "csv"}`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Download ready. It holds guests' personal details: keep it somewhere private.");
    } catch {
      toast("Couldn't prepare the download. Check your connection and try again.", { tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Download your data" description="Your church's data belongs to your church. Take a copy whenever you like.">
        <div className="px-5 pt-4 pb-5">
          {!canDownload && (
            <p className="mb-4 flex items-start gap-2 rounded-lg bg-bg px-3 py-2.5 text-sm text-ink-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
              {demo ? "Downloads aren't available in the demo." : "Only the church owner can download the church's data."}
            </p>
          )}
          <ul className="divide-y divide-line rounded-lg border border-line">
            {DOWNLOADS.map(({ format, title, detail, icon: Icon }) => (
              <li key={format} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                <Icon className="hidden h-5 w-5 shrink-0 text-ink-3 sm:block" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{title}</p>
                  <p className="mt-0.5 text-sm text-ink-2">{detail}</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canDownload || busy !== null}
                  onClick={() => download(format)}
                  aria-label={`Download ${title.toLowerCase()}`}
                >
                  {busy === format && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  {busy === format ? "Preparing…" : "Download"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card title="How your data is used" description="Your church starts at the most private setting.">
        <ul className="divide-y divide-line px-5 pt-1 pb-3">
          <ConsentRow on={consent.inTenantOnly} label="Used only for your church" detail="Your guests' conversations help only your church's assistant." />
          <ConsentRow on={consent.contributePatterns} label="Shared, de-identified patterns" detail="Patterns with every name and detail removed, to improve 1Stayz for all churches." />
          <ConsentRow on={consent.contributeAggregates} label="Cross-church counts" detail={`Totals like reply rates, with any count under ${consent.kMinimum} hidden.`} />
          <ConsentRow on={consent.shareDenominationFamily} label="Your denomination family in those counts" />
          <ConsentRow on={consent.trainingAuthorized} label="Training AI models" detail="Never during the pilot. No model is trained on your conversations." />
        </ul>
        <p className="border-t border-line px-5 py-3 text-xs text-ink-2">
          {consent.addendumSignedAt
            ? "Set by your signed Learning Consent Addendum. To change it, contact Lifeverse."
            : "Sharing anything beyond your church needs a signed Learning Consent Addendum. Until then, nothing leaves your church."}
        </p>
      </Card>

      <Card title="Keeping it safe" icon={ShieldCheck}>
        <ul className="list-disc space-y-1.5 px-5 pt-3 pb-5 pl-9 text-sm text-ink-2">
          <li>The files include guests&apos; names, phone numbers, email addresses and messages, some of them about prayer or care. Store them where only your team can see them.</li>
          <li>Each download is recorded in your church&apos;s audit log with who downloaded it and when.</li>
          <li>Intake keys aren&apos;t included: only their labels and the first characters.</li>
          <li>If your data ever needs restoring, 1Stayz can put back your church alone, without affecting other churches.</li>
        </ul>
      </Card>
    </div>
  );
}

function ConsentRow({ on, label, detail }: { on: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      {on ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <X className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{label}</p>
        {detail && <p className="mt-0.5 text-xs text-ink-2">{detail}</p>}
      </div>
      <span className={on ? "text-xs font-medium text-success" : "text-xs font-medium text-ink-3"}>{on ? "On" : "Off"}</span>
    </li>
  );
}
