"use client";

import { useId, useState, useTransition } from "react";
import { AlertTriangle, Check, CircleAlert, Lock, MessageSquareText, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import {
  approveFirstMessage,
  approveFirstMessageFamily,
  removeFirstMessageFamily,
  reviewFirstMessageAgain,
  saveFirstMessage,
  saveFirstMessageFamily,
} from "@/lib/church/actions";
import {
  checkFirstMessage,
  FAMILIES,
  HARD_MAX_SEGMENTS,
  MAX_SEGMENTS,
  renderFirstMessage,
  REVIEW_LABEL_TEXT,
  type FirstMessageContext,
  type FirstMessageFamily,
} from "@/lib/church/first-message";
import type { ChurchFirstMessage, ChurchFirstMessageFamily, FirstMessageReview } from "@/lib/church/types";
import { cn } from "@/lib/cn";
import { MESSAGE_VARIABLES } from "@/lib/onboarding/constants";
import { formatTimestamp, SAMPLE_FIRST_NAME, smsSegments } from "@/lib/onboarding/message";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge, { type Tone } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";

// Settings > First Message (AI-07): the three first-contact families. Welcome goes to everyone
// and must be approved to go live; the two optional families replace it for guests who came with
// kids or have visited before, once the pastor approves them. Each card shows the wording rules
// as you type, a preview, and the 1Stayz review (frontier model) for the pastor to weigh.


type Status = "draft" | "awaiting" | "approved";
const STATUS: Record<Status, { label: string; tone: Tone }> = {
  approved: { label: "Approved", tone: "success" },
  awaiting: { label: "Awaiting pastor", tone: "warning" },
  draft: { label: "Draft", tone: "neutral" },
};

interface Saved {
  body: string;
  status: Status;
  approvedBy: string | null;
  approvedAt: string | null;
  review: FirstMessageReview | null;
}

export default function FirstMessagesEditor({
  welcome,
  families,
  ctx,
  demo,
  live,
  canEdit,
  onWelcomeSaved,
}: {
  welcome: ChurchFirstMessage | null;
  families: { family: ChurchFirstMessageFamily | null; returning: ChurchFirstMessageFamily | null };
  ctx: FirstMessageContext;
  demo: boolean;
  live: boolean;
  /** The church owner (not the demo): edits and approves. Others read only. */
  canEdit: boolean;
  onWelcomeSaved: (message: ChurchFirstMessage) => void;
}) {
  if (!welcome) {
    return (
      <Card title="First messages" description="The first text every guest receives after a visit">
        <EmptyState icon={MessageSquareText} title="No first message yet" body="Choose and approve one in the First Message step of setup." />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-ink-2">
        Every guest gets one first text after their visit. 1Stayz picks the message that fits what the connect card told us: returning guests first, then
        families with kids, then everyone else. A message is only used once your pastor approves it; until then those guests get the Welcome message.
      </p>
      <MessageCard
        family="welcome"
        subtitle={welcome.templateName}
        initial={{ ...welcome, review: welcome.review ?? null }}
        ctx={ctx}
        demo={demo}
        live={live}
        canEdit={canEdit}
        onSaved={(s) => onWelcomeSaved({ ...welcome, ...s, status: s.status })}
      />
      <MessageCard family="returning" initial={families.returning} ctx={ctx} demo={demo} live={live} canEdit={canEdit} />
      <MessageCard family="family" initial={families.family} ctx={ctx} demo={demo} live={live} canEdit={canEdit} />
    </div>
  );
}

function MessageCard({
  family,
  subtitle,
  initial,
  ctx,
  demo,
  live,
  canEdit,
  onSaved,
}: {
  family: FirstMessageFamily;
  subtitle?: string;
  initial: Saved | null;
  ctx: FirstMessageContext;
  demo: boolean;
  live: boolean;
  canEdit: boolean;
  onSaved?: (saved: Saved) => void;
}) {
  const meta = FAMILIES[family];
  const toast = useToast();
  const [saved, setSaved] = useState<Saved | null>(initial);
  const [body, setBody] = useState(initial?.body ?? "");
  const [writing, setWriting] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reviewing, setReviewing] = useState(false);
  const errorId = useId();
  const editable = canEdit && !demo;

  function update(next: Saved | null) {
    setSaved(next);
    if (next) onSaved?.(next);
  }

  // An optional family that isn't set up.
  if (!saved && !writing) {
    return (
      <Card title={meta.name} description={meta.who} action={<StatusBadge tone="neutral">Not set up</StatusBadge>}>
        <div className="px-5 pt-3 pb-5">
          <p className="text-sm text-ink-2">These guests get the Welcome message for now.</p>
          {editable && (
            <Button
              className="mt-3"
              variant="secondary"
              onClick={() => {
                setBody(meta.defaultBody);
                setWriting(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Write this message
            </Button>
          )}
        </div>
      </Card>
    );
  }

  const checks = checkFirstMessage(body, ctx);
  const blocking = checks.find((c) => !c.ok && c.blocking);
  const dirty = !saved || body.trim() !== saved.body.trim();
  const preview = renderFirstMessage(body, ctx, SAMPLE_FIRST_NAME);
  const sms = smsSegments(preview);
  const status = saved ? STATUS[saved.status] : STATUS.draft;
  const review = saved && !dirty ? saved.review : null;

  function save() {
    if (blocking || !dirty) return;
    startTransition(async () => {
      const text = body.trim();
      const fail = { ok: false as const, error: "Couldn't save. Check your connection and try again." };
      const result = family === "welcome" ? await saveFirstMessage(text).catch(() => fail) : await saveFirstMessageFamily(family, text).catch(() => fail);
      if (!result.ok) {
        toast(result.error, { tone: "danger" });
        return;
      }
      const next = result.data.status;
      const reset = next !== "approved";
      const was = saved?.status;
      update({
        body: text,
        status: next,
        approvedBy: reset ? null : (saved?.approvedBy ?? null),
        approvedAt: reset ? null : (saved?.approvedAt ?? null),
        review: result.data.review,
      });
      setBody(text);
      setWriting(false);
      toast(
        family === "welcome" && reset && was === "approved" && live
          ? "Saved. Your pastor needs to approve the new wording, so you're back in Shadow mode."
          : reset
            ? "Saved. Your pastor needs to approve this wording before guests get it."
            : "Saved.",
      );
    });
  }

  function approve() {
    if (!saved) return;
    startTransition(async () => {
      const fail = { ok: false as const, error: "Couldn't approve. Check your connection and try again." };
      const result = family === "welcome" ? await approveFirstMessage().catch(() => fail) : await approveFirstMessageFamily(family).catch(() => fail);
      if (!result.ok) {
        toast(result.error, { tone: "danger" });
        return;
      }
      update({ ...saved, status: "approved", approvedBy: result.data.approvedBy, approvedAt: result.data.approvedAt });
      toast(family === "welcome" ? "First message approved." : `Approved. ${meta.name} now get this message.`);
    });
  }

  function remove() {
    if (family === "welcome") return;
    startTransition(async () => {
      const result = await removeFirstMessageFamily(family).catch(() => ({ ok: false as const, error: "Couldn't turn it off. Try again." }));
      if (!result.ok) {
        toast(result.error, { tone: "danger" });
        return;
      }
      setSaved(null);
      setWriting(false);
      setBody("");
      toast("Turned off. These guests get the Welcome message.");
    });
  }

  async function reviewAgain() {
    if (!saved) return;
    setReviewing(true);
    const result = await reviewFirstMessageAgain(family, saved.body).catch(() => null);
    setReviewing(false);
    if (!result?.ok) {
      toast(result?.error ?? "Couldn't run the review. Try again.", { tone: "danger" });
      return;
    }
    update({ ...saved, review: result.data.review });
  }

  return (
    <Card
      title={meta.name}
      description={subtitle ? `${meta.who} · ${subtitle}` : meta.who}
      action={<StatusBadge tone={saved ? status.tone : "neutral"}>{saved ? status.label : "New"}</StatusBadge>}
    >
      <div className="px-5 pt-3 pb-5">
        <label className="block">
          <span className="sr-only">{meta.name} message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={2000}
            disabled={pending || !editable}
            aria-invalid={Boolean(blocking && dirty)}
            aria-describedby={errorId}
            className="w-full resize-y rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed text-ink outline-none focus:border-teal aria-[invalid=true]:border-danger"
          />
        </label>
        {editable && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
            Variables:
            {MESSAGE_VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                disabled={pending}
                onClick={() => setBody((m) => `${m}${m.endsWith(" ") ? "" : " "}${v}`)}
                className="rounded bg-bg px-1.5 py-0.5 font-mono text-[11px] text-ink transition-colors hover:bg-line/60"
              >
                {v}
              </button>
            ))}
          </p>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <ul id={errorId} className="space-y-1.5" aria-label="Wording checks">
            {checks.map((c) => (
              <li key={c.id} className="flex gap-2 text-xs leading-relaxed">
                {c.ok ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-label="Passes" />
                ) : c.blocking ? (
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-label="Must fix" />
                ) : (
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-label="Suggestion" />
                )}
                <span className={c.ok ? "text-ink-2" : c.blocking ? "text-danger" : "text-ink"}>
                  {c.label}
                  {!c.ok && c.detail && <span className="block text-ink-3">{c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="rounded-xl bg-bg p-3">
            <p className="mb-2 text-[11px] font-medium tracking-wide text-ink-3 uppercase">Preview</p>
            <div className="rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-ink shadow-card">
              {preview || "…"}
            </div>
            <p className="mt-2 text-[11px] text-ink-3">
              {sms.length} characters · {sms.segments} text{sms.segments === 1 ? "" : "s"}
              {sms.segments > MAX_SEGMENTS && ` (we suggest ${MAX_SEGMENTS}; ${HARD_MAX_SEGMENTS} at most)`}
            </p>
          </div>
        </div>

        {saved && !dirty && <ReviewPanel review={review} busy={reviewing} onAgain={editable ? reviewAgain : undefined} />}

        {saved?.status === "approved" && saved.approvedAt && !dirty && (
          <p className="mt-4 text-xs text-ink-2">
            Approved by {saved.approvedBy} on {formatTimestamp(saved.approvedAt)}
          </p>
        )}
        {saved?.status === "approved" && dirty && (
          <p className="animate-fade-in mt-4 flex gap-2 rounded-lg bg-warning-tint px-3 py-2 text-xs leading-relaxed text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Saving new wording sends it back to your pastor for approval
            {family === "welcome" && live ? " and switches the assistant to Shadow mode until then" : family === "welcome" ? "" : "; these guests get the Welcome message until then"}.
          </p>
        )}

        {editable && dirty && blocking && (
          <p role="status" className="mt-4 flex gap-2 rounded-lg bg-danger-tint px-3 py-2 text-xs leading-relaxed text-danger">
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Can&rsquo;t save yet:
              {checks
                .filter((c) => !c.ok && c.blocking)
                .map((c) => (
                  <span key={c.id} className="block">
                    {"· "}
                    {c.detail ?? `${c.label}.`}
                  </span>
                ))}
            </span>
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          {family !== "welcome" && editable && saved && !dirty && (
            <Button variant="ghost" onClick={remove} disabled={pending} className="mr-auto">
              Turn off
            </Button>
          )}
          {editable && dirty && !pending && (
            <Button
              variant="ghost"
              onClick={() => {
                if (saved) setBody(saved.body);
                else {
                  setWriting(false);
                  setBody("");
                }
              }}
            >
              {saved ? "Discard" : "Cancel"}
            </Button>
          )}
          {!editable ? null : !dirty && saved && saved.status !== "approved" ? (
            <Button variant="primary" onClick={approve} disabled={pending}>
              <Check className="h-4 w-4" aria-hidden="true" />
              {pending ? "Approving…" : "Approve this wording"}
            </Button>
          ) : (
            <Button variant="primary" onClick={save} disabled={!dirty || Boolean(blocking) || pending}>
              {pending ? "Saving and reviewing…" : "Save changes"}
            </Button>
          )}
        </div>
        {!canEdit && !demo && (
          <p className="mt-3 flex items-center justify-end gap-1.5 text-xs text-ink-3">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Only the church owner can change or approve the first messages.
          </p>
        )}
      </div>
    </Card>
  );
}

function ReviewPanel({ review, busy, onAgain }: { review: FirstMessageReview | null; busy: boolean; onAgain?: () => void }) {
  const again = onAgain && (
    <button type="button" onClick={onAgain} disabled={busy} className="inline-flex items-center gap-1 font-medium text-teal-text hover:underline disabled:opacity-60">
      <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} aria-hidden="true" />
      {busy ? "Reviewing…" : "Review again"}
    </button>
  );
  const shell = "mt-4 rounded-lg border px-3 py-2.5 text-xs leading-relaxed";
  if (!review) {
    return (
      <div className={cn(shell, "flex flex-wrap items-center gap-x-3 gap-y-1 border-line text-ink-2")}>
        <Sparkles className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
        Not reviewed by 1Stayz yet. {again}
      </div>
    );
  }
  if (review.verdict === "unavailable") {
    return (
      <div className={cn(shell, "flex flex-wrap items-center gap-x-3 gap-y-1 border-line text-ink-2")}>
        <Sparkles className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
        The 1Stayz review couldn&apos;t run, so your pastor approves without it. {again}
      </div>
    );
  }
  if (review.verdict === "pass") {
    return (
      <div className={cn(shell, "flex flex-wrap items-center gap-x-3 gap-y-1 border-success/30 bg-success-tint text-success")}>
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        1Stayz review: warm and clear, nothing to flag.
      </div>
    );
  }
  return (
    <div className={cn(shell, "border-warning/30 bg-warning-tint text-ink")}>
      <p className="flex items-center gap-2 font-medium text-warning">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        1Stayz review: worth a second look before approving
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-9">
        {review.labels.map((l) => (
          <li key={l}>{REVIEW_LABEL_TEXT[l] ?? l}</li>
        ))}
      </ul>
      <p className="mt-1.5 text-ink-2">Your pastor decides: approve as is, or edit and save to review again. {again}</p>
    </div>
  );
}
