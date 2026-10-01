"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, FileText, Globe, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { NOW } from "@/data/clock";
import { STAFF } from "@/data/staff";
import { GUARDRAILS, TONE, TRAINING_DOCUMENTS } from "@/data/training";
import type { Guardrail, GuardrailStance, ToneSettings, TrainingDocument } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/format";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import StatusBadge, { DOCUMENT_BADGE, SEVERITY_BADGE, STANCE_LABEL } from "@/components/ui/StatusBadge";
import Tabs, { Segmented } from "@/components/ui/Tabs";

type Tab = "documents" | "guardrails" | "tone";

export default function AiTrainingPage() {
  const [tab, setTab] = useState<Tab>("documents");
  return (
    <div className="space-y-6">
      <Tabs
        label="AI training sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "documents", label: "Training Documents" },
          { id: "guardrails", label: "Guardrails" },
          { id: "tone", label: "Tone" },
        ]}
      />
      {tab === "documents" && <Documents />}
      {tab === "guardrails" && <Guardrails />}
      {tab === "tone" && <Tone />}
    </div>
  );
}

function sizeLabel(kb: number | null) {
  if (kb === null) return "Web page";
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

function Documents() {
  const [docs, setDocs] = useState<TrainingDocument[]>(TRAINING_DOCUMENTS);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Simulates the indexing pipeline: pending → processing → indexed.
  function advance(id: string) {
    const set = (status: TrainingDocument["status"], sections: number | null = null) =>
      setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, status, sections } : d)));
    timers.current.push(window.setTimeout(() => set("processing"), 600));
    timers.current.push(window.setTimeout(() => set("indexed", 8 + Math.floor(Math.random() * 20)), 3200));
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const added = Array.from(files).map<TrainingDocument>((f, i) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return {
        id: `up-${Date.now()}-${i}`,
        name: f.name,
        kind: ext === "pdf" ? "pdf" : ext === "docx" ? "docx" : "txt",
        sizeKb: Math.max(1, Math.round(f.size / 1024)),
        uploadedAt: NOW.toISOString(),
        status: "pending",
        sections: null,
      };
    });
    setDocs((ds) => [...added, ...ds]);
    added.forEach((d) => advance(d.id));
  }

  const counts = { indexed: 0, processing: 0, pending: 0, failed: 0 };
  docs.forEach((d) => (counts[d.status] += 1));

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "animate-slide-up flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
            dragging ? "border-teal bg-[#E8F4F2]/60" : "border-line bg-surface",
          )}
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F4F2] text-teal">
            <Upload className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-medium text-ink">Drop files to teach the assistant</p>
          <p className="mt-1 text-xs text-ink-2">Welcome guides, beliefs, ministry handbooks. PDF, DOCX or TXT up to 20 MB.</p>
          <Button variant="primary" size="sm" className="mt-4" onClick={() => inputRef.current?.click()}>
            Choose files
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <Card flush delay={60}>
          <ul className="divide-y divide-line">
            {docs.map((d) => (
              <li key={d.id} className="animate-fade-in flex flex-wrap items-center gap-3 px-5 py-3.5 sm:flex-nowrap">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg text-ink-2">
                  {d.kind === "url" ? <Globe className="h-4 w-4" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{d.name}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-2">
                    {d.error ? (
                      <span className="text-danger">{d.error}</span>
                    ) : (
                      <>
                        {sizeLabel(d.sizeKb)} · Added {formatShortDate(d.uploadedAt)}
                        {d.sections !== null && ` · ${d.sections} sections`}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {d.status === "failed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDocs((ds) => ds.map((x) => (x.id === d.id ? { ...x, status: "pending", error: undefined } : x)));
                        advance(d.id);
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Retry
                    </Button>
                  )}
                  <StatusBadge tone={DOCUMENT_BADGE[d.status].tone} className={d.status === "processing" ? "[&>span]:animate-pulse" : undefined}>
                    {DOCUMENT_BADGE[d.status].label}
                  </StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Knowledge base" icon={Bot} delay={120} className="self-start">
        <dl className="grid grid-cols-2 gap-3">
          {(Object.keys(counts) as (keyof typeof counts)[]).map((k) => (
            <div key={k} className="rounded-lg bg-bg p-3">
              <dt className="text-[11px] text-ink-2">{DOCUMENT_BADGE[k].label}</dt>
              <dd className="mt-0.5 text-xl font-semibold text-ink tabular-nums">{counts[k]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-ink-2">
          The assistant only answers from indexed documents. When it can&apos;t find an answer, it says so and offers to connect the guest with a
          person.
        </p>
      </Card>
    </div>
  );
}

const STANCES = Object.keys(STANCE_LABEL) as GuardrailStance[];

function Guardrails() {
  const [rails, setRails] = useState<Guardrail[]>(GUARDRAILS);
  const patch = (id: string, change: Partial<Guardrail>) => setRails((rs) => rs.map((r) => (r.id === id ? { ...r, ...change } : r)));

  return (
    <Card
      title="Sensitive topics"
      icon={ShieldCheck}
      description="How the assistant responds when a conversation touches these topics. Critical topics always notify a person."
      flush
    >
      <ul className="divide-y divide-line border-t border-line">
        {rails.map((r, i) => (
          <li key={r.id} className="animate-fade-in flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center" style={{ animationDelay: `${i * 30}ms` }}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-ink">{r.topic}</p>
                <StatusBadge tone={SEVERITY_BADGE[r.severity].tone}>{SEVERITY_BADGE[r.severity].label}</StatusBadge>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{r.description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label={`Stance for ${r.topic}`}
                value={r.stance}
                onChange={(stance) => patch(r.id, { stance, routeToId: stance === "route" ? (r.routeToId ?? STAFF[0]!.id) : undefined })}
                tabs={STANCES.map((s) => ({ id: s, label: STANCE_LABEL[s] }))}
              />
              {r.stance === "route" && (
                <select
                  aria-label={`Route ${r.topic} to`}
                  value={r.routeToId}
                  onChange={(e) => patch(r.id, { routeToId: e.target.value })}
                  className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink outline-none focus:border-teal"
                >
                  {STAFF.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Slider({ label, low, high, value, onChange }: { label: string; low: string; high: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="text-xs text-ink-3 tabular-nums">{value}</span>
      </span>
      <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-teal" />
      <span className="flex justify-between text-[11px] text-ink-3">
        <span>{low}</span>
        <span>{high}</span>
      </span>
    </label>
  );
}

function previewFor(t: ToneSettings) {
  const hi = t.formality > 60 ? "Good afternoon, Marcus." : t.warmth > 60 ? "Hi Marcus!" : "Hi Marcus,";
  const body =
    t.length === "brief"
      ? "Thanks for joining us Sunday."
      : t.length === "balanced"
        ? "Thanks for joining us Sunday. We hope Ava and Eli enjoyed Grace Kids."
        : "Thanks for joining us Sunday. We hope Ava and Eli enjoyed Grace Kids, and that the morning felt like a place you could belong. If any questions came up, I'm happy to help.";
  const warm = t.warmth > 60 ? " We're really glad you came" + (t.emoji ? " 😊" : ".") : "";
  const verse = t.scriptureUse === "gently" ? "\n\n“The Lord bless you and keep you.” Numbers 6:24" : "";
  return `${hi} ${body}${warm}${verse}\n\n${t.signOff}`;
}

function Tone() {
  const [tone, setTone] = useState<ToneSettings>(TONE);
  const set = <K extends keyof ToneSettings>(k: K, v: ToneSettings[K]) => setTone((t) => ({ ...t, [k]: v }));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title="Voice" description="Applies to every message the assistant drafts">
        <div className="space-y-6">
          <Slider label="Warmth" low="Reserved" high="Effusive" value={tone.warmth} onChange={(v) => set("warmth", v)} />
          <Slider label="Formality" low="Casual" high="Formal" value={tone.formality} onChange={(v) => set("formality", v)} />
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Message length</p>
            <Segmented
              label="Message length"
              value={tone.length}
              onChange={(v) => set("length", v)}
              tabs={[
                { id: "brief", label: "Brief" },
                { id: "balanced", label: "Balanced" },
                { id: "detailed", label: "Detailed" },
              ]}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Scripture</p>
            <Segmented
              label="Scripture use"
              value={tone.scriptureUse}
              onChange={(v) => set("scriptureUse", v)}
              tabs={[
                { id: "never", label: "Never" },
                { id: "when_asked", label: "When asked" },
                { id: "gently", label: "Gently include" },
              ]}
            />
          </div>
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-ink">Emoji</span>
              <span className="block text-xs text-ink-2">Occasional, never more than one per message</span>
            </span>
            <input type="checkbox" checked={tone.emoji} onChange={(e) => set("emoji", e.target.checked)} className="h-4 w-4 accent-teal" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Sign-off</span>
            <input
              value={tone.signOff}
              onChange={(e) => set("signOff", e.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-teal"
            />
          </label>
        </div>
      </Card>

      <Card title="Live preview" icon={Bot} description="A Day 0 thank-you to a family that visited Sunday" delay={60} className="self-start">
        <div className="rounded-2xl rounded-br-md bg-[#E8F4F2] px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-ink">{previewFor(tone)}</div>
      </Card>
    </div>
  );
}
