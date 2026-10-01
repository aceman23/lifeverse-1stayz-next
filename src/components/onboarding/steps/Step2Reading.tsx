"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { DAYS, DEFAULT_MINISTRIES, GUEST_FIELDS, SCANNED_SERVICES } from "@/lib/onboarding/constants";
import { useOnboarding } from "@/lib/onboarding/context";
import type { ServiceRow } from "@/lib/onboarding/types";
import { makeId } from "@/lib/onboarding/id";
import { serviceTimeError } from "@/lib/onboarding/validation";
import Card from "../ui/Card";
import Chip from "../ui/Chip";
import SectionHeader from "../ui/SectionHeader";
import Select from "../ui/Select";
import StatusPill from "../ui/StatusPill";
import TextField from "../ui/TextField";

const SCAN_MS = 1500;
const newId = () => makeId("svc");

export default function Step2Reading() {
  const { state, update } = useOnboarding();
  const [scanning, setScanning] = useState(!state.siteScanned);
  const [customMinistry, setCustomMinistry] = useState("");

  // Pretend to read the church website, then fill in the drafts once.
  useEffect(() => {
    if (state.siteScanned) return;
    const timer = setTimeout(() => {
      update((s) => ({
        siteScanned: true,
        serviceSchedule: s.serviceSchedule.length
          ? s.serviceSchedule
          : SCANNED_SERVICES.map((svc) => ({ ...svc, id: newId(), reviewed: false })),
      }));
      setScanning(false);
    }, SCAN_MS);
    return () => clearTimeout(timer);
  }, [state.siteScanned, update]);

  const website = state.church.website.trim() || "your website";

  if (scanning) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Reading Your Site"
          description="We're reading your website to save you time. This will just take a moment."
        />
        <Card>
          <div className="flex flex-col items-center gap-3 py-12 text-center" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-[#10B981]" aria-hidden="true" />
            <p className="text-sm font-medium text-stone-900">Scanning {website}…</p>
            <p className="text-xs text-stone-400">Looking for service times, ministries, and connect card fields</p>
          </div>
        </Card>
      </div>
    );
  }

  const services = state.serviceSchedule;
  const setServices = (fn: (rows: ServiceRow[]) => ServiceRow[]) =>
    update((s) => ({ serviceSchedule: fn(s.serviceSchedule) }));
  const editRow = (id: string, patch: Partial<ServiceRow>) =>
    setServices((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const toggleIn = (key: "ministries" | "guestFields", value: string) =>
    update((s) => ({
      [key]: s[key].includes(value) ? s[key].filter((v) => v !== value) : [...s[key], value],
    }));

  const allMinistries = [...DEFAULT_MINISTRIES, ...state.ministries.filter((m) => !DEFAULT_MINISTRIES.includes(m))];

  function addMinistry() {
    const name = customMinistry.trim();
    if (!name) return;
    if (!state.ministries.includes(name)) update((s) => ({ ministries: [...s.ministries, name] }));
    setCustomMinistry("");
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Reading Your Site"
        description="We read your website to save you time. Everything below is a draft — review and approve each card."
      />

      <Card title="Service Schedule" action={<StatusPill tone="amber">Draft — needs pastor review</StatusPill>}>
        {services.length === 0 && <p className="mb-4 text-sm text-stone-400">No services found.</p>}
        <ul className="space-y-3">
          {services.map((row, i) => {
            const error = serviceTimeError(row);
            return (
              <li key={row.id} className="rounded-xl border border-stone-200 p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_8rem_8.5rem_8.5rem]">
                  <TextField
                    label="Service name"
                    className="col-span-2 sm:col-span-1"
                    value={row.name}
                    onChange={(name) => editRow(row.id, { name })}
                    placeholder="Sunday Morning"
                  />
                  <Select
                    label="Day"
                    className="col-span-2 sm:col-span-1"
                    value={row.day}
                    onChange={(day) => editRow(row.id, { day })}
                    options={DAYS}
                  />
                  <TextField
                    label="Starts"
                    type="time"
                    value={row.startTime}
                    onChange={(startTime) => editRow(row.id, { startTime })}
                    aria-invalid={Boolean(error)}
                  />
                  <TextField
                    label="Ends"
                    type="time"
                    value={row.endTime}
                    onChange={(endTime) => editRow(row.id, { endTime })}
                    aria-invalid={Boolean(error)}
                  />
                </div>
                {error && (
                  <p role="alert" className="mt-2 text-xs text-red-600">
                    {error}
                  </p>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    aria-pressed={row.reviewed}
                    onClick={() => editRow(row.id, { reviewed: !row.reviewed })}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium ${
                      row.reviewed ? "text-emerald-700" : "text-stone-500 hover:text-stone-900"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        row.reviewed ? "border-[#10B981] bg-[#10B981] text-white" : "border-stone-300"
                      }`}
                    >
                      {row.reviewed && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    </span>
                    Reviewed — looks right
                  </button>
                  <button
                    type="button"
                    onClick={() => setServices((rows) => rows.filter((r) => r.id !== row.id))}
                    aria-label={`Remove service ${i + 1}${row.name ? `: ${row.name}` : ""}`}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() =>
            setServices((rows) => [
              ...rows,
              { id: newId(), name: "", day: "Sunday", startTime: "", endTime: "", reviewed: false },
            ])
          }
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-emerald-700 hover:text-emerald-900"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add service
        </button>
      </Card>

      <Card title="Ministries & Programs" description="Select the ministries your assistant should know about.">
        <div className="flex flex-wrap gap-2">
          {allMinistries.map((m) => (
            <Chip key={m} selected={state.ministries.includes(m)} onToggle={() => toggleIn("ministries", m)}>
              {m}
            </Chip>
          ))}
        </div>
        <form
          className="mt-4 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addMinistry();
          }}
        >
          <TextField
            label="Add a ministry"
            className="flex-1"
            value={customMinistry}
            onChange={setCustomMinistry}
            placeholder="e.g. Food Pantry"
          />
          <button
            type="submit"
            disabled={!customMinistry.trim()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 hover:border-stone-300 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add
          </button>
        </form>
      </Card>

      <Card title="Guest Info to Collect" description="Which fields should your assistant ask guests about?">
        <div className="flex flex-wrap gap-2">
          {GUEST_FIELDS.map((f) => (
            <Chip key={f.id} selected={state.guestFields.includes(f.id)} onToggle={() => toggleIn("guestFields", f.id)}>
              {f.label}
            </Chip>
          ))}
        </div>
      </Card>
    </div>
  );
}
