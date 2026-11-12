"use client";

import { useId, useState, useTransition } from "react";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { saveServiceSchedule } from "@/lib/church/actions";
import type { ChurchService } from "@/lib/church/types";
import { DAYS } from "@/lib/onboarding/constants";
import { makeId } from "@/lib/onboarding/id";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-teal aria-[invalid=true]:border-danger";

/** "18:30" -> "6:30 PM" */
function clock(hhmm: string) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** What's wrong with a row, or null. Mirrors saveServiceSchedule so most mistakes show before saving. */
function rowError(s: ChurchService): string | null {
  if (!s.name.trim()) return "Give the service a name.";
  if (!s.day) return "Pick a day.";
  if (!s.startTime || !s.endTime) return "Set a start and end time.";
  if (s.startTime >= s.endTime) return "The end time must be after the start time.";
  return null;
}

/**
 * Settings › Service Schedule. Each service has Edit (pencil) and Remove; Add service opens a new
 * row. Every save writes the whole schedule. Any church member can change it (same as the profile).
 */
export default function ScheduleEditor({ initial, timezoneLabel, demo }: { initial: ChurchService[]; timezoneLabel: string; demo: boolean }) {
  const toast = useToast();
  const [services, setServices] = useState(initial);
  // The row being edited (its draft), and whether it's new (Cancel drops it).
  const [editing, setEditing] = useState<{ draft: ChurchService; isNew: boolean } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function persist(next: ChurchService[], done: string, after?: () => void) {
    setError(null);
    if (demo) {
      setServices(next);
      after?.();
      toast("Demo workspace: changes aren't saved.", { tone: "info" });
      return;
    }
    startTransition(async () => {
      const result = await saveServiceSchedule(next).catch(() => ({ ok: false as const, error: "Couldn't save the schedule. Check your connection and try again." }));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setServices(result.data.services);
      after?.();
      toast(done);
    });
  }

  function saveDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const draft = { ...editing.draft, name: editing.draft.name.replace(/\s+/g, " ").trim() };
    const problem = rowError(draft);
    if (problem) return setError(problem);
    const next = editing.isNew ? [...services, draft] : services.map((s) => (s.id === draft.id ? draft : s));
    persist(next, editing.isNew ? "Service added." : "Service updated.", () => setEditing(null));
  }

  function remove(id: string) {
    if (services.length <= 1) {
      setConfirmRemove(null);
      return setError("Keep at least one service. First texts are timed from it.");
    }
    persist(
      services.filter((s) => s.id !== id),
      "Service removed.",
      () => setConfirmRemove(null),
    );
  }

  function startEdit(s: ChurchService) {
    setError(null);
    setConfirmRemove(null);
    setEditing({ draft: { ...s }, isNew: false });
  }

  function startAdd() {
    setError(null);
    setConfirmRemove(null);
    const last = services.at(-1);
    setEditing({ draft: { id: makeId("svc"), name: "", day: last?.day || "Sunday", startTime: "", endTime: "" }, isNew: true });
  }

  const form = editing && (
    <ServiceForm
      draft={editing.draft}
      isNew={editing.isNew}
      pending={pending}
      error={error}
      onChange={(patch) => {
        setError(null);
        setEditing((e) => e && { ...e, draft: { ...e.draft, ...patch } });
      }}
      onSubmit={saveDraft}
      onCancel={() => {
        setEditing(null);
        setError(null);
      }}
    />
  );

  return (
    <Card
      title="Service Schedule"
      description={`The assistant invites guests to these times. First texts go out within 30 minutes after a service ends (${timezoneLabel}).`}
      flush
    >
      {services.length === 0 && !editing ? (
        <div className="border-t border-line">
          <EmptyState icon={CalendarClock} title="No services yet" body="Add your services so first texts go out at the right time." />
        </div>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {services.map((s) =>
            editing && !editing.isNew && editing.draft.id === s.id ? (
              <li key={s.id} className="bg-bg/60 px-5 py-4">
                {form}
              </li>
            ) : (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E8F4F2] text-teal">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {s.day || "Day not set"} · {s.startTime ? clock(s.startTime) : "Time not set"}
                    {s.endTime && <span className="font-normal text-ink-2"> – {clock(s.endTime)}</span>}
                  </p>
                  <p className="truncate text-xs text-ink-2">{s.name || "Untitled service"}</p>
                </div>
                {confirmRemove === s.id ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)} disabled={pending}>
                      Keep
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(s.id)} disabled={pending}>
                      {pending ? "Removing…" : "Remove"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => startEdit(s)}
                      disabled={pending || Boolean(editing)}
                      aria-label={`Edit ${s.name || "service"}`}
                      title="Edit"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-bg hover:text-ink disabled:opacity-40"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setConfirmRemove(s.id);
                      }}
                      disabled={pending || Boolean(editing)}
                      aria-label={`Remove ${s.name || "service"}`}
                      title="Remove"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-danger-tint hover:text-danger disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </li>
            ),
          )}
          {editing?.isNew && <li className="bg-bg/60 px-5 py-4">{form}</li>}
        </ul>
      )}
      {error && !editing && (
        <p role="alert" className="border-t border-line px-5 py-2.5 text-xs text-danger">
          {error}
        </p>
      )}
      {!editing?.isNew && (
        <div className="border-t border-line px-5 py-3">
          <Button variant="ghost" size="sm" onClick={startAdd} disabled={pending || Boolean(editing) || services.length >= 20}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add service
          </Button>
        </div>
      )}
    </Card>
  );
}

function ServiceForm({
  draft,
  isNew,
  pending,
  error,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: ChurchService;
  isNew: boolean;
  pending: boolean;
  error: string | null;
  onChange: (patch: Partial<ChurchService>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  const id = useId();
  return (
    <form onSubmit={onSubmit} noValidate aria-label={isNew ? "New service" : `Edit ${draft.name || "service"}`}>
      <p className="text-sm font-medium text-ink">{isNew ? "New service" : "Edit service"}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_8rem_8rem]">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor={`${id}-name`} className="text-xs font-medium text-ink-2">
            Name
          </label>
          <input
            id={`${id}-name`}
            className={inputClass}
            value={draft.name}
            maxLength={200}
            placeholder="Sunday Morning Service"
            autoFocus
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor={`${id}-day`} className="text-xs font-medium text-ink-2">
            Day
          </label>
          <select id={`${id}-day`} className={inputClass} value={draft.day} onChange={(e) => onChange({ day: e.target.value })}>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-start`} className="text-xs font-medium text-ink-2">
            Starts
          </label>
          <input id={`${id}-start`} type="time" className={inputClass} value={draft.startTime} onChange={(e) => onChange({ startTime: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-end`} className="text-xs font-medium text-ink-2">
            Ends
          </label>
          <input id={`${id}-end`} type="time" className={inputClass} value={draft.endTime} onChange={(e) => onChange({ endTime: e.target.value })} />
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Saving…" : isNew ? "Add service" : "Save"}
        </Button>
      </div>
    </form>
  );
}
