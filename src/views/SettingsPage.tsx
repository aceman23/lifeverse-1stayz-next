"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Church,
  MessageSquareText,
  Plug,
  Plus,
  Radio,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { STAFF } from "@/data/staff";
import { GUARDRAILS } from "@/data/training";
import type { WorkspaceMode } from "@/data/types";
import { CHURCH, FIRST_MESSAGE, INTEGRATIONS, MODE_COPY, SERVICES } from "@/data/workspace";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/lib/workspace-context";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import StatusBadge, { SEVERITY_BADGE, STANCE_LABEL } from "@/components/ui/StatusBadge";

type Section = "profile" | "schedule" | "guardrails" | "team" | "message" | "integrations" | "mode";

const SECTIONS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "profile", label: "Church Profile", icon: Church },
  { id: "schedule", label: "Service Schedule", icon: CalendarClock },
  { id: "guardrails", label: "Guardrails", icon: ShieldCheck },
  { id: "team", label: "Team & Escalations", icon: UsersRound },
  { id: "message", label: "First Message", icon: MessageSquareText },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "mode", label: "Mode", icon: Radio },
];

const inputClass = "mt-1.5 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-teal";

export default function SettingsPage() {
  const { mode } = useWorkspace();
  const [section, setSection] = useState<Section>("profile");
  const [church, setChurch] = useState(CHURCH);
  const [message, setMessage] = useState(FIRST_MESSAGE);
  const [integrations, setIntegrations] = useState(INTEGRATIONS);

  const done: Record<Section, boolean> = {
    profile: Boolean(church.name && church.phone && church.address && church.website),
    schedule: SERVICES.length > 0,
    guardrails: GUARDRAILS.length > 0,
    team: STAFF.every((s) => s.escalationTopics.length > 0),
    message: message.trim().length > 0,
    integrations: integrations.some((i) => i.connected),
    mode: mode !== "setup",
  };
  const completed = Object.values(done).filter(Boolean).length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_260px]">
      {/* Sub-nav: a scrolling chip row on mobile, a list from lg up */}
      <nav aria-label="Settings sections" className="animate-fade-in min-w-0">
        <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:px-0">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const active = section === id;
            return (
              <li key={id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSection(id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm whitespace-nowrap transition-colors",
                    active ? "bg-surface font-medium text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:bg-surface/70 hover:text-ink",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-teal" : "text-ink-3")} aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                  {done[id] && <Check className="hidden h-3.5 w-3.5 text-success lg:block" aria-label="Complete" />}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div key={section} className="min-w-0">
        {section === "profile" && (
          <Card title="Church Profile" description="Used in every message and on the assistant's web chat">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(
                [
                  ["name", "Church name"],
                  ["phone", "Church phone"],
                  ["website", "Website"],
                  ["denomination", "Denomination"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-xs font-medium text-ink-2">{label}</span>
                  <input value={church[key]} onChange={(e) => setChurch({ ...church, [key]: e.target.value })} className={inputClass} />
                </label>
              ))}
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-ink-2">Address</span>
                <input value={church.address} onChange={(e) => setChurch({ ...church, address: e.target.value })} className={inputClass} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-2">Time zone</span>
                <select value={church.timezone} onChange={(e) => setChurch({ ...church, timezone: e.target.value })} className={inputClass}>
                  <option value="America/New_York">Eastern</option>
                  <option value="America/Chicago">Central</option>
                  <option value="America/Denver">Mountain</option>
                  <option value="America/Los_Angeles">Pacific</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-2">Average weekend attendance</span>
                <input
                  type="number"
                  value={church.averageAttendance}
                  onChange={(e) => setChurch({ ...church, averageAttendance: Number(e.target.value) })}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end">
              <Button variant="primary">Save changes</Button>
            </div>
          </Card>
        )}

        {section === "schedule" && (
          <Card title="Service Schedule" description="The assistant invites guests to these times" flush>
            <ul className="divide-y divide-line border-t border-line">
              {SERVICES.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#E8F4F2] text-teal">
                    <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">
                      {s.day} · {s.time}
                    </p>
                    <p className="text-xs text-ink-2">{s.name}</p>
                  </div>
                  {s.kids && <StatusBadge tone="teal">Kids program</StatusBadge>}
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-3">
              <Button variant="ghost" size="sm">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add service
              </Button>
            </div>
          </Card>
        )}

        {section === "guardrails" && (
          <Card
            title="Guardrails"
            description="Sensitive topics and how the assistant handles them"
            action={
              <Link href="/ai-training" className="inline-flex items-center gap-1 text-xs font-medium text-teal-text hover:underline">
                Edit in AI Training <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
            flush
          >
            <ul className="divide-y divide-line border-t border-line">
              {GUARDRAILS.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                  <span className="min-w-0 flex-1 text-sm text-ink">{g.topic}</span>
                  <StatusBadge tone={SEVERITY_BADGE[g.severity].tone}>{SEVERITY_BADGE[g.severity].label}</StatusBadge>
                  <span className="w-28 text-right text-xs text-ink-2">{STANCE_LABEL[g.stance]}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {section === "team" && (
          <Card title="Team & Escalations" description="Who gets notified when the assistant hands a conversation to a person" flush>
            <ul className="divide-y divide-line border-t border-line">
              {STAFF.map((s) => (
                <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={s.name} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{s.name}</p>
                      <p className="truncate text-xs text-ink-2">
                        {s.role} · {s.phone}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    {s.escalationTopics.map((t) => (
                      <span key={t} className="rounded-full bg-bg px-2.5 py-1 text-xs text-ink-2">
                        {t}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-3">
              <Button variant="ghost" size="sm">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Invite teammate
              </Button>
            </div>
          </Card>
        )}

        {section === "message" && (
          <Card title="First Message" description="The Day 0 thank-you every first-time guest receives">
            <label className="block">
              <span className="sr-only">First message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="w-full resize-y rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed text-ink outline-none focus:border-teal"
              />
            </label>
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
              Variables:
              {["{first_name}", "{service_day}", "{church_name}"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMessage((m) => `${m}${m.endsWith(" ") ? "" : " "}${v}`)}
                  className="rounded bg-bg px-1.5 py-0.5 font-mono text-[11px] text-ink transition-colors hover:bg-line/60"
                >
                  {v}
                </button>
              ))}
            </p>
            <div className="mt-5 rounded-xl bg-bg p-4">
              <p className="mb-2 text-[11px] font-medium tracking-wide text-ink-3 uppercase">Preview</p>
              <div className="max-w-sm rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink shadow-card">
                {message.replaceAll("{first_name}", "Marcus").replaceAll("{service_day}", "this morning").replaceAll("{church_name}", church.name)}
              </div>
              <p className="mt-2 text-[11px] text-ink-3">{message.length} characters · {Math.max(1, Math.ceil(message.length / 160))} SMS segment(s)</p>
            </div>
          </Card>
        )}

        {section === "integrations" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {integrations.map((i, idx) => (
              <article
                key={i.id}
                className="animate-slide-up flex flex-col rounded-xl border border-line bg-surface p-5 shadow-card"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-bg text-sm font-semibold text-ink">
                    {i.name[0]}
                  </span>
                  <StatusBadge tone={i.connected ? "success" : "neutral"}>{i.connected ? "Connected" : "Not connected"}</StatusBadge>
                </div>
                <p className="mt-3 text-sm font-medium text-ink">{i.name}</p>
                <p className="mt-0.5 flex-1 text-xs leading-relaxed text-ink-2">{i.description}</p>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-ink-3">{i.lastSync && `Synced ${i.lastSync}`}</span>
                  <Button
                    size="sm"
                    variant={i.connected ? "ghost" : "secondary"}
                    onClick={() =>
                      setIntegrations((list) =>
                        list.map((x) => (x.id === i.id ? { ...x, connected: !x.connected, lastSync: x.connected ? null : "just now" } : x)),
                      )
                    }
                  >
                    {i.connected ? "Disconnect" : "Connect"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        {section === "mode" && <ModeSettings />}
      </div>

      <aside className="min-w-0 lg:col-start-2 xl:col-start-auto">
        <Card title="Setup checklist" description={`${completed} of ${SECTIONS.length} complete`} delay={80}>
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-bg">
            <div className="h-full rounded-full bg-teal transition-[width] duration-500" style={{ width: `${(completed / SECTIONS.length) * 100}%` }} />
          </div>
          <ul className="space-y-1">
            {SECTIONS.map(({ id, label }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setSection(id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-bg"
                >
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      done[id] ? "border-success bg-success text-white" : "border-line bg-surface",
                    )}
                  >
                    {done[id] && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
                  </span>
                  <span className={done[id] ? "text-ink-2" : "font-medium text-ink"}>{label}</span>
                  <span className="sr-only">{done[id] ? "complete" : "incomplete"}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}

const MODE_ACCENT: Record<WorkspaceMode, string> = {
  setup: "bg-ink-3",
  shadow: "bg-warning",
  live: "bg-success",
};

function ModeSettings() {
  const { mode, setMode } = useWorkspace();
  return (
    <Card title="Mode" description="Controls whether the assistant can send messages on its own">
      <div role="radiogroup" aria-label="Workspace mode" className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {(Object.keys(MODE_COPY) as WorkspaceMode[]).map((m) => {
          const on = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMode(m)}
              className={cn(
                "flex flex-col rounded-xl border p-4 text-left transition-all",
                on ? "border-teal bg-[#E8F4F2]/50 ring-1 ring-teal" : "border-line hover:border-ink-3",
              )}
            >
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className={cn("h-2 w-2 rounded-full", MODE_ACCENT[m])} aria-hidden="true" />
                  {MODE_COPY[m].label}
                </span>
                {on && <Check className="h-4 w-4 text-teal" aria-hidden="true" />}
              </span>
              <span className="mt-2 text-xs leading-relaxed text-ink-2">{MODE_COPY[m].description}</span>
            </button>
          );
        })}
      </div>
      {mode === "live" && (
        <p className="animate-fade-in mt-4 rounded-lg bg-warning-tint px-3 py-2 text-xs leading-relaxed text-warning">
          Live mode sends routine messages without review. Guardrail topics marked &ldquo;Route to pastor&rdquo; still wait for a person.
        </p>
      )}
    </Card>
  );
}
