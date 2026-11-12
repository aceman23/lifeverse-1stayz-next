"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, BellRing, Moon, Pencil, Phone, Plus, Trash2, Users } from "lucide-react";
import { useOnboarding } from "@/lib/onboarding/context";
import { makeId } from "@/lib/onboarding/id";
import type { StaffMember } from "@/lib/onboarding/types";
import { syncEscalationOrder } from "@/lib/onboarding/validation";
import Card from "../ui/Card";
import Checkbox from "../ui/Checkbox";
import SectionHeader from "../ui/SectionHeader";
import TextField, { labelClass } from "../ui/TextField";
import Toggle from "../ui/Toggle";

const iconButton =
  "flex h-11 w-11 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-50 hover:text-stone-900 disabled:opacity-30";

export default function Step6Team() {
  const { state, update } = useOnboarding();
  const [editing, setEditing] = useState<string | null>(null);

  const setStaff = (fn: (staff: StaffMember[]) => StaffMember[]) =>
    update((s) => {
      const staff = fn(s.staff);
      return { staff, escalationOrder: syncEscalationOrder(staff, s.escalationOrder) };
    });
  const editMember = (id: string, patch: Partial<StaffMember>) =>
    setStaff((staff) => staff.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  function addMember() {
    const id = makeId("staff");
    setStaff((staff) => [
      ...staff,
      { id, name: "", role: "", mobile: "", email: "", receivesEscalations: false, receivesCare: true, receivesGeneral: true },
    ]);
    setEditing(id);
  }

  const order = syncEscalationOrder(state.staff, state.escalationOrder);
  const byId = new Map(state.staff.map((m) => [m.id, m]));
  function move(index: number, delta: number) {
    const next = [...order];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    update({ escalationOrder: next });
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Team & Escalations"
        description="When someone needs a pastor, 1Stayz needs to know who to contact and in what order."
      />

      <Card title="Team Members" icon={Users} description="Turn on Escalations for at least one person.">
        <ul className="space-y-3">
          {state.staff.map((m) => (
            <li key={m.id} className="rounded-xl border border-stone-200 p-3">
              {editing === m.id ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TextField label="Name" value={m.name} onChange={(name) => editMember(m.id, { name })} autoFocus />
                  <TextField label="Role" value={m.role} onChange={(role) => editMember(m.id, { role })} />
                  <TextField label="Mobile" type="tel" value={m.mobile} onChange={(mobile) => editMember(m.id, { mobile })} />
                  <TextField label="Email" type="email" value={m.email} onChange={(email) => editMember(m.id, { email })} />
                </div>
              ) : (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-900">{m.name || "Unnamed"}</p>
                  <p className="truncate text-xs text-stone-400">
                    {[m.role, m.mobile, m.email].filter(Boolean).join(" · ") || "No details yet"}
                  </p>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-5">
                <Toggle label="Escalations" checked={m.receivesEscalations} onChange={(v) => editMember(m.id, { receivesEscalations: v })} />
                <Toggle label="Care" checked={m.receivesCare} onChange={(v) => editMember(m.id, { receivesCare: v })} />
                <Toggle label="General" checked={m.receivesGeneral} onChange={(v) => editMember(m.id, { receivesGeneral: v })} />
                <div className="ml-auto flex">
                  <button
                    type="button"
                    onClick={() => setEditing(editing === m.id ? null : m.id)}
                    className={editing === m.id ? "min-h-11 rounded-lg px-3 text-xs font-medium text-emerald-700" : iconButton}
                    aria-label={editing === m.id ? undefined : `Edit ${m.name || "team member"}`}
                  >
                    {editing === m.id ? "Done" : <Pencil className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaff((staff) => staff.filter((s) => s.id !== m.id))}
                    aria-label={`Remove ${m.name || "team member"}`}
                    className={`${iconButton} hover:text-red-600`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addMember}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-emerald-700 hover:text-emerald-900"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add team member
        </button>
      </Card>

      <Card title="Escalation Order" description="Who gets contacted first, second, third…">
        {order.length === 0 ? (
          <p className="text-sm text-amber-700">Turn on Escalations for at least one team member.</p>
        ) : (
          <ol className="space-y-2">
            {order.map((id, i) => (
              <li key={id} className="flex items-center gap-3 rounded-lg border border-stone-200 py-1 pr-1 pl-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold text-stone-600">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-stone-900">{byId.get(id)?.name || "Unnamed"}</span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${byId.get(id)?.name} up`} className={iconButton}>
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${byId.get(id)?.name} down`} className={iconButton}>
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-stone-400">A human replies to escalations within 15 minutes.</p>
      </Card>

      <Card title="Quiet Hours" icon={Moon} description="No automated texts during these hours in the GUEST's local time.">
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <TextField label="Start" type="time" value={state.quietHoursStart} onChange={(quietHoursStart) => update({ quietHoursStart })} />
          <TextField label="End" type="time" value={state.quietHoursEnd} onChange={(quietHoursEnd) => update({ quietHoursEnd })} />
        </div>
      </Card>

      <Card title="Staff Alerts" icon={BellRing}>
        <Toggle
          label="Enable SMS alerts to staff when escalations occur"
          checked={state.staffAlertsEnabled}
          onChange={(staffAlertsEnabled) => update({ staffAlertsEnabled })}
        />
        {state.staffAlertsEnabled && (
          <div className="mt-3 space-y-4">
            {/* Alerts go to the same people as escalations, at the mobile number on their staff record. */}
            <div>
              <p className={labelClass}>Select staff who should receive SMS alerts</p>
              <ul className="space-y-2">
                {state.staff.map((m) => (
                  <li key={m.id} className="rounded-xl border border-stone-200 p-3">
                    <label className="flex min-h-11 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={m.receivesEscalations}
                        onChange={(e) => editMember(m.id, { receivesEscalations: e.target.checked })}
                        className="h-5 w-5 shrink-0 cursor-pointer rounded accent-[#10B981]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-700">
                        {m.name || "Unnamed staff member"}
                      </span>
                      <span className="shrink-0 text-xs text-stone-400">{m.role}</span>
                    </label>
                    {m.receivesEscalations && (
                      <TextField
                        label="Mobile number"
                        icon={Phone}
                        type="tel"
                        className="mt-3 pl-8"
                        value={m.mobile}
                        onChange={(mobile) => editMember(m.id, { mobile })}
                        placeholder="(555) 123-4567"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <Checkbox checked={state.staffAlertsConsent} onChange={(staffAlertsConsent) => update({ staffAlertsConsent })}>
              I confirm that selected staff members have consented to receive SMS alerts at their listed mobile numbers.
              {!state.staffAlertsConsent && <span className="font-medium text-amber-700"> Required to continue.</span>}
            </Checkbox>
          </div>
        )}
      </Card>
    </div>
  );
}
