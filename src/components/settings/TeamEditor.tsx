"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Bell, Check, Lock, Mail, Moon, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { saveTeam } from "@/lib/church/actions";
import type { ChurchSettings, ChurchStaffMember } from "@/lib/church/types";
import { teamErrors, type TeamInput } from "@/lib/church/validation";
import { cn } from "@/lib/cn";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

// UI-08: Settings › Team & Escalations. Who's on the team, who gets escalations and in what order
// (that's who gets the email first when someone needs a pastor), the team alerts phone, and quiet
// hours. Church owner only; others see it read-only.

const inputClass =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-teal aria-[invalid=true]:border-danger disabled:bg-bg disabled:text-ink-2";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

function fromSettings(s: ChurchSettings): TeamInput {
  return {
    staff: s.staff.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      mobile: m.mobile,
      email: m.email,
      receivesEscalations: m.receivesEscalations,
      receivesCare: m.receivesCare,
      receivesGeneral: m.receivesGeneral,
    })),
    escalationOrder: [...s.staff]
      .filter((m) => m.receivesEscalations)
      .sort((a, b) => (a.escalationRank ?? 99) - (b.escalationRank ?? 99))
      .map((m) => m.id),
    quietHours: s.quietHours,
    staffAlerts: s.staffAlerts,
  };
}

const ROLES: { key: keyof Pick<ChurchStaffMember, "receivesEscalations" | "receivesCare" | "receivesGeneral">; label: string }[] = [
  { key: "receivesEscalations", label: "Needs a pastor" },
  { key: "receivesCare", label: "Care requests" },
  { key: "receivesGeneral", label: "General questions" },
];

export default function TeamEditor({ settings, canEdit }: { settings: ChurchSettings; canEdit: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [saved, setSaved] = useState(() => fromSettings(settings));
  const [draft, setDraft] = useState(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // People whose details are open for editing (new people open straight away).
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const toggleOpen = (id: string, open: boolean) =>
    setOpenIds((s) => {
      const next = new Set(s);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const readOnly = !canEdit;

  const set = (patch: Partial<TeamInput>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      // Keep the order in step with who receives escalations.
      const receivers = next.staff.filter((m) => m.receivesEscalations).map((m) => m.id);
      next.escalationOrder = [...next.escalationOrder.filter((id) => receivers.includes(id)), ...receivers.filter((id) => !next.escalationOrder.includes(id))];
      return next;
    });
    setFormError(null);
  };
  const setMember = (id: string, patch: Partial<TeamInput["staff"][number]>) => {
    set({ staff: draft.staff.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
    // Keep it open while they fix it, but let them close it once they've changed something.
    if (errors[id]) {
      toggleOpen(id, true);
      setErrors((e) => {
        const next = { ...e };
        delete next[id];
        return next;
      });
    }
  };
  const move = (id: string, by: -1 | 1) => {
    const order = [...draft.escalationOrder];
    const i = order.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    set({ escalationOrder: order });
  };

  function save() {
    const found = teamErrors(draft);
    setErrors(found);
    if (Object.keys(found).length) return setFormError("Check the highlighted fields.");
    start(async () => {
      const res = await saveTeam(draft);
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        return setFormError(res.error);
      }
      setSaved(draft);
      setErrors({});
      setOpenIds(new Set());
      toast("Team saved.");
      router.refresh();
    });
  }

  const nameOf = (id: string) => draft.staff.find((m) => m.id === id)?.name.trim() || "Unnamed";

  return (
    <div className="space-y-4">
      {readOnly && (
        <p className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-xs text-ink-2">
          <Lock className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          {settings.demo ? "This is the demo workspace, so the team can't be changed." : "Only the church owner can change the team."}
        </p>
      )}

      <Card title="Team" description="Who 1Stayz notifies, and about what" flush>
        <fieldset disabled={readOnly || pending}>
          <ul className="divide-y divide-line border-t border-line">
            {draft.staff.map((m) => {
              const open = !readOnly && (openIds.has(m.id) || Boolean(errors[m.id]));
              const label = m.name.trim() || "this person";
              const roles = ROLES.filter(({ key }) => m[key]);
              return (
                <li key={m.id} className={cn("px-5 py-4", open && "bg-bg/60")}>
                  {open ? (
                    <div className="space-y-2.5">
                      <div className="flex items-start gap-3">
                        <Avatar name={m.name || "?"} />
                        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                          <input className={inputClass} value={m.name} maxLength={100} placeholder="Name" aria-label="Name" aria-invalid={errors[m.id] === "Add a name."} onChange={(e) => setMember(m.id, { name: e.target.value })} />
                          <input className={inputClass} value={m.role} maxLength={100} placeholder="Role, e.g. Care Pastor" aria-label="Role" onChange={(e) => setMember(m.id, { role: e.target.value })} />
                          <input className={inputClass} type="email" value={m.email} maxLength={320} placeholder="Email" aria-label="Email" onChange={(e) => setMember(m.id, { email: e.target.value })} />
                          <input className={inputClass} type="tel" value={m.mobile} maxLength={40} placeholder="Mobile" aria-label="Mobile" onChange={(e) => setMember(m.id, { mobile: e.target.value })} />
                        </div>
                      </div>
                      <p className="pl-11 text-xs text-ink-2">What {m.name.trim() || "they"} get{m.name.trim() ? "s" : ""}:</p>
                      <div className="flex flex-wrap gap-1.5 pl-11">
                        {ROLES.map(({ key, label: roleLabel }) => (
                          <label
                            key={key}
                            className={cn(
                              "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                              m[key] ? "border-teal bg-teal/10 text-teal-text" : "border-line text-ink-2",
                              pending && "cursor-default",
                            )}
                          >
                            <input type="checkbox" className="sr-only" checked={m[key]} onChange={(e) => setMember(m.id, { [key]: e.target.checked })} />
                            {m[key] && <Check className="h-3 w-3" aria-hidden="true" />}
                            {roleLabel}
                          </label>
                        ))}
                      </div>
                      {errors[m.id] && (
                        <p role="alert" className="pl-11 text-xs text-danger">
                          {errors[m.id]}
                        </p>
                      )}
                      <div className="flex items-center justify-between pl-11">
                        <button
                          type="button"
                          onClick={() => set({ staff: draft.staff.filter((x) => x.id !== m.id) })}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-danger hover:bg-danger-tint"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Remove {m.name.trim() ? m.name.trim().split(/\s+/)[0] : "person"}
                        </button>
                        <Button size="sm" variant="secondary" onClick={() => toggleOpen(m.id, false)} disabled={Boolean(errors[m.id])}>
                          Done
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <Avatar name={m.name || "?"} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {m.name.trim() || "Unnamed"}
                          {m.role.trim() && <span className="font-normal text-ink-2"> · {m.role.trim()}</span>}
                        </p>
                        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2">
                          {m.email.trim() && (
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <Mail className="h-3 w-3 shrink-0 text-ink-3" aria-hidden="true" />
                              <span className="truncate">{m.email.trim()}</span>
                            </span>
                          )}
                          {m.mobile.trim() && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3 shrink-0 text-ink-3" aria-hidden="true" />
                              {m.mobile.trim()}
                            </span>
                          )}
                        </p>
                        <p className="mt-2 flex flex-wrap gap-1.5">
                          {roles.length ? (
                            roles.map(({ key, label: roleLabel }) => (
                              <span key={key} className="rounded-full bg-teal/10 px-2.5 py-0.5 text-[11px] font-medium text-teal-text">
                                {roleLabel}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-ink-3">No notifications</span>
                          )}
                        </p>
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => toggleOpen(m.id, true)}
                          aria-label={`Edit ${label}`}
                          title="Edit"
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-bg hover:text-ink"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
            {errors.team ? (
              <p role="alert" className="text-xs text-danger">
                {errors.team}
              </p>
            ) : (
              <span />
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  const id = newId();
                  set({
                    staff: [...draft.staff, { id, name: "", role: "", mobile: "", email: "", receivesEscalations: false, receivesCare: false, receivesGeneral: false }],
                  });
                  toggleOpen(id, true);
                }}
                className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-teal-text hover:underline"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add a person
              </button>
            )}
          </div>
        </fieldset>
      </Card>

      <Card title="Escalation order" description="When a guest needs a pastor, everyone here gets an email right away, in this order. After 15 minutes without a reply they're reminded. Use the arrows to change the order, then Save team." delay={40}>
        {draft.escalationOrder.length === 0 ? (
          <p className="text-sm text-ink-2">Nobody yet. Turn on &ldquo;Needs a pastor&rdquo; for at least one person above.</p>
        ) : (
          <ol className="space-y-1.5">
            {draft.escalationOrder.map((id, i) => (
              <li key={id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-1.5">
                <span className="w-5 text-center text-xs font-semibold text-ink-3 tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{nameOf(id)}</span>
                {!readOnly && (
                  <span className="flex gap-1.5">
                    <button type="button" disabled={i === 0 || pending} onClick={() => move(id, -1)} aria-label={`Move ${nameOf(id)} up`} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-bg hover:text-ink disabled:opacity-30">
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" disabled={i === draft.escalationOrder.length - 1 || pending} onClick={() => move(id, 1)} aria-label={`Move ${nameOf(id)} down`} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-bg hover:text-ink disabled:opacity-30">
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="Alerts and quiet hours" delay={80}>
        <fieldset disabled={readOnly || pending} className="space-y-5">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input type="checkbox" className="h-4 w-4 accent-teal" checked={draft.staffAlerts.enabled} onChange={(e) => set({ staffAlerts: { ...draft.staffAlerts, enabled: e.target.checked } })} />
              <Bell className="h-4 w-4 text-ink-3" aria-hidden="true" />
              Also text the team phone when someone needs a pastor
            </label>
            {draft.staffAlerts.enabled && (
              <div className="mt-3 space-y-2 pl-6">
                <input
                  className={cn(inputClass, "sm:max-w-xs")}
                  type="tel"
                  value={draft.staffAlerts.phone}
                  maxLength={40}
                  placeholder="(555) 123-4567"
                  aria-label="Team alerts phone"
                  aria-invalid={Boolean(errors.alerts)}
                  onChange={(e) => set({ staffAlerts: { ...draft.staffAlerts, phone: e.target.value } })}
                />
                <label className="flex items-start gap-2 text-xs text-ink-2">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal" checked={draft.staffAlerts.consent} onChange={(e) => set({ staffAlerts: { ...draft.staffAlerts, consent: e.target.checked } })} />
                  The person who uses this phone agreed to get alert texts from 1Stayz. Message and data rates may apply.
                </label>
                {errors.alerts && (
                  <p role="alert" className="text-xs text-danger">
                    {errors.alerts}
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-teal"
                checked={draft.quietHours !== null}
                onChange={(e) => set({ quietHours: e.target.checked ? { start: "21:00", end: "08:00" } : null })}
              />
              <Moon className="h-4 w-4 text-ink-3" aria-hidden="true" />
              Quiet hours: no automatic texts to guests
            </label>
            {draft.quietHours && (
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-6 text-sm text-ink-2">
                <input type="time" className={cn(inputClass, "w-32")} aria-label="Quiet hours start" value={draft.quietHours.start} onChange={(e) => set({ quietHours: { ...draft.quietHours!, start: e.target.value } })} />
                to
                <input type="time" className={cn(inputClass, "w-32")} aria-label="Quiet hours end" value={draft.quietHours.end} onChange={(e) => set({ quietHours: { ...draft.quietHours!, end: e.target.value } })} />
                <span className="text-xs text-ink-3">church time. Your own replies still go out.</span>
              </div>
            )}
            {errors.quietHours && (
              <p role="alert" className="mt-2 pl-6 text-xs text-danger">
                {errors.quietHours}
              </p>
            )}
          </div>
        </fieldset>
      </Card>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {formError && (
            <p role="alert" className="mr-auto text-sm text-danger">
              {formError}
            </p>
          )}
          {dirty && (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setDraft(saved);
                setErrors({});
                setOpenIds(new Set());
                setFormError(null);
              }}
            >
              Undo
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={save} disabled={!dirty || pending}>
            {pending ? "Saving…" : "Save team"}
          </Button>
        </div>
      )}
    </div>
  );
}
