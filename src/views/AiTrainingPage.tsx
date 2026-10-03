"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  File,
  FileText,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { NOW } from "@/data/clock";
import { CURRENT_USER } from "@/data/staff";
import { CHATBOTS } from "@/data/training";
import type { Chatbot, ChatbotStatus, ChatbotTone, DocumentStatus, GuardrailRule, GuardrailRuleType, Severity, TrainingDocument } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

type Tab = "documents" | "guardrails" | "persona";

const BOT_STATUS: Record<ChatbotStatus, { label: string; dot: string; badge: string }> = {
  draft: { label: "Draft", dot: "bg-stone-300", badge: "border-stone-200 bg-stone-50 text-stone-500" },
  training: { label: "Training", dot: "bg-blue-500", badge: "border-blue-100 bg-blue-50 text-blue-700" },
  active: { label: "Active", dot: "bg-emerald-500", badge: "border-emerald-100 bg-emerald-50 text-emerald-700" },
  paused: { label: "Paused", dot: "bg-amber-500", badge: "border-amber-100 bg-amber-50 text-amber-700" },
};

const FILE_TINT: Record<TrainingDocument["kind"], string> = {
  pdf: "bg-rose-50 text-rose-600",
  docx: "bg-blue-50 text-blue-600",
  txt: "bg-stone-100 text-stone-500",
  md: "bg-teal-50 text-teal-600",
  url: "bg-sky-50 text-sky-600",
};

const DOC_STATUS: Record<DocumentStatus, { label: string; icon: LucideIcon; color: string }> = {
  indexed: { label: "Indexed", icon: CheckCircle2, color: "text-emerald-600" },
  processing: { label: "Processing", icon: Loader2, color: "text-blue-500" },
  pending: { label: "Pending", icon: Clock, color: "text-amber-500" },
  failed: { label: "Failed", icon: AlertTriangle, color: "text-rose-500" },
};

const RULE_TYPE: Record<GuardrailRuleType, { label: string; icon: LucideIcon }> = {
  blocked_topic: { label: "Blocked Topic", icon: X },
  required_response: { label: "Required Response", icon: CheckCircle2 },
  escalation_trigger: { label: "Escalation Trigger", icon: AlertTriangle },
  tone_constraint: { label: "Tone Constraint", icon: SlidersHorizontal },
  content_boundary: { label: "Content Boundary", icon: Shield },
};

const SEVERITY: Record<Severity, { label: string; badge: string; tile: string }> = {
  low: { label: "Low", badge: "bg-stone-100 text-stone-500", tile: "bg-stone-100 text-stone-500" },
  medium: { label: "Medium", badge: "bg-amber-100 text-amber-700", tile: "bg-amber-50 text-amber-600" },
  high: { label: "High", badge: "bg-orange-100 text-orange-700", tile: "bg-orange-50 text-orange-600" },
  critical: { label: "Critical", badge: "bg-rose-100 text-rose-700", tile: "bg-rose-50 text-rose-600" },
};

const TONE_SLIDERS: { key: keyof ChatbotTone; label: string; hint: string }[] = [
  { key: "warmth", label: "Warmth", hint: "Caring, personal tone in every message" },
  { key: "directness", label: "Directness", hint: "Balanced — not pushy, not too passive" },
  { key: "formality", label: "Formality", hint: "Conversational over formal language" },
  { key: "scripture", label: "Scripture Use", hint: "How often to cite scripture" },
];

const DEFAULT_PROMPT = "You are a helpful pastoral care assistant.";

const primaryGreen = "inline-flex items-center gap-2 rounded-lg bg-[#2ec27e] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1a2e2a] disabled:opacity-50";
const fieldClass =
  "w-full rounded-lg border border-line px-3 py-2.5 text-sm text-ink transition outline-none placeholder:text-ink-3 focus:border-[#2ec27e] focus:ring-2 focus:ring-[#2ec27e]/20";
const labelClass = "mb-1.5 block text-xs font-medium text-ink-2";

function StatusPill({ status }: { status: ChatbotStatus }) {
  const s = BOT_STATUS[status];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", s.badge)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot, status === "training" && "animate-pulse")} aria-hidden="true" />
      {s.label}
    </span>
  );
}

export default function AiTrainingPage() {
  const [bots, setBots] = useState<Chatbot[]>(CHATBOTS);
  const [selectedId, setSelectedId] = useState(CHATBOTS[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>("documents");
  const [creating, setCreating] = useState(false);
  const selected = bots.find((b) => b.id === selectedId) ?? null;

  const update = (id: string, change: (bot: Chatbot) => Partial<Chatbot>) =>
    setBots((bs) => bs.map((b) => (b.id === id ? { ...b, ...change(b) } : b)));

  return (
    <div>
      <header className="animate-slide-up mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">AI Training</h1>
          <p className="mt-1 text-sm text-ink-3">
            {"Train internal chatbots with your church's proprietary content and set guardrails for safe AI behavior."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1a2e2a] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#245045]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Chatbot
        </button>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {bots.map((bot, i) => (
          <BotCard key={bot.id} bot={bot} selected={bot.id === selectedId} onSelect={() => setSelectedId(bot.id)} delay={i * 40} />
        ))}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line p-5 text-ink-3 transition-colors hover:border-[#2ec27e] hover:text-[#2ec27e]"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
          <span className="text-sm font-medium">Create New Chatbot</span>
        </button>
      </div>

      {selected && (
        <BotDetail
          key={selected.id}
          bot={selected}
          tab={tab}
          onTab={setTab}
          onChange={(change) => update(selected.id, change)}
        />
      )}

      <CreateBotModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={(bot) => {
          setBots((bs) => [...bs, bot]);
          setSelectedId(bot.id);
          setTab("persona");
          setCreating(false);
        }}
      />
    </div>
  );
}

function BotCard({ bot, selected, onSelect, delay }: { bot: Chatbot; selected: boolean; onSelect: () => void; delay: number }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "animate-slide-up flex flex-col rounded-2xl border bg-surface p-5 text-left transition-all",
        selected ? "border-[#2ec27e] shadow-md ring-2 ring-[#2ec27e]/10" : "border-line/60 hover:border-line hover:shadow-sm",
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-sm">
          <Bot className="h-5 w-5 text-white" strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{bot.name}</span>
          <span className="mt-0.5 block truncate text-xs text-ink-3">{bot.model}</span>
        </span>
        <StatusPill status={bot.status} />
      </div>
      <span className="mb-4 line-clamp-2 text-xs leading-relaxed text-ink-2">{bot.description ?? "No description provided."}</span>
      <span className="mt-auto flex items-center gap-4 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1">
          <FileText className="h-3 w-3" aria-hidden="true" />
          {bot.documents.length} docs
        </span>
        <span className="inline-flex items-center gap-1">
          <Shield className="h-3 w-3" aria-hidden="true" />
          {bot.guardrails.length} guardrails
        </span>
        {bot.lastTrainedAt && (
          <span className="ml-auto inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatRelative(bot.lastTrainedAt)}
          </span>
        )}
      </span>
    </button>
  );
}

type BotChange = (bot: Chatbot) => Partial<Chatbot>;

function BotDetail({ bot, tab, onTab, onChange }: { bot: Chatbot; tab: Tab; onTab: (t: Tab) => void; onChange: (change: BotChange) => void }) {
  const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
    { id: "documents", label: "Training Documents", icon: FileText },
    { id: "guardrails", label: "Guardrails", icon: Shield },
    { id: "persona", label: "Persona & Tone", icon: SlidersHorizontal },
  ];

  return (
    <section className="animate-slide-up overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-card" style={{ animationDelay: "120ms" }}>
      <div role="tablist" aria-label={`${bot.name} settings`} className="flex gap-1 overflow-x-auto border-b border-line/50 px-4 pt-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.id ? "border-[#2ec27e] text-[#1a2e2a]" : "border-transparent text-ink-3 hover:text-ink-2",
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="p-5">
        {tab === "documents" && <DocumentsTab bot={bot} onChange={onChange} />}
        {tab === "guardrails" && <GuardrailsTab bot={bot} onChange={onChange} />}
        {tab === "persona" && <PersonaTab bot={bot} onChange={onChange} />}
      </div>
    </section>
  );
}

function TabHeader({ title, description, action }: { title: string; description: string; action: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-xs text-ink-3">{description}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyTab({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Icon className="h-8 w-8 text-line" aria-hidden="true" />
      <p className="text-sm text-ink-3">{title}</p>
      <p className="text-xs text-ink-3/70">{body}</p>
    </div>
  );
}

// ── Documents ──────────────────────────────────────────────────────

function sizeLabel(kb: number) {
  return kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function DocumentsTab({ bot, onChange }: { bot: Chatbot; onChange: (change: BotChange) => void }) {
  const [uploading, setUploading] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const setDoc = (id: string, change: Partial<TrainingDocument>) =>
    onChange((b) => ({ documents: b.documents.map((d) => (d.id === id ? { ...d, ...change } : d)) }));

  // Simulates the indexing pipeline: pending → processing → indexed.
  function index(id: string) {
    timers.current.push(window.setTimeout(() => setDoc(id, { status: "processing" }), 600));
    timers.current.push(window.setTimeout(() => setDoc(id, { status: "indexed", sections: 8 + Math.floor(Math.random() * 20) }), 3200));
  }

  return (
    <div>
      <TabHeader
        title="Training Documents"
        description={`Upload sermons, policies, and core messaging to train ${bot.name}.`}
        action={
          <button type="button" onClick={() => setUploading(true)} className={primaryGreen}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Upload Document
          </button>
        }
      />

      {bot.documents.length === 0 ? (
        <EmptyTab icon={FileText} title="No training documents yet." body="Upload PDFs, sermon notes, or core messaging files to get started." />
      ) : (
        <ul className="space-y-2">
          {bot.documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onRetry={() => {
                setDoc(doc.id, { status: "pending", error: undefined });
                index(doc.id);
              }}
              onDelete={() => onChange((b) => ({ documents: b.documents.filter((d) => d.id !== doc.id) }))}
            />
          ))}
        </ul>
      )}

      <UploadModal
        open={uploading}
        onClose={() => setUploading(false)}
        onUpload={(doc) => {
          onChange((b) => ({ documents: [doc, ...b.documents] }));
          index(doc.id);
          setUploading(false);
        }}
      />
    </div>
  );
}

function DocumentRow({ doc, onRetry, onDelete }: { doc: TrainingDocument; onRetry: () => void; onDelete: () => void }) {
  const status = DOC_STATUS[doc.status];
  return (
    <li className="group animate-fade-in flex items-center gap-3 rounded-xl border border-line/30 bg-bg/50 p-3.5 transition-colors hover:border-line/60">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", FILE_TINT[doc.kind])}>
        <File className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{doc.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
          <span className="text-[10px] font-medium uppercase">{doc.kind}</span>
          {doc.sizeKb !== null && (
            <>
              <span className="text-line">·</span>
              <span>{sizeLabel(doc.sizeKb)}</span>
            </>
          )}
          <span className="text-line">·</span>
          <span className={cn("inline-flex items-center gap-1", status.color)}>
            <status.icon className={cn("h-3 w-3", doc.status === "processing" && "animate-spin")} aria-hidden="true" />
            {status.label}
          </span>
          {doc.sections !== null && (
            <>
              <span className="text-line">·</span>
              <span>{doc.sections} sections</span>
            </>
          )}
          {doc.uploadedBy && (
            <>
              <span className="text-line">·</span>
              <span>{doc.uploadedBy}</span>
            </>
          )}
        </p>
        {(doc.error ?? doc.summary) && (
          <p className={cn("mt-1 line-clamp-1 text-xs", doc.error ? "text-rose-500" : "text-ink-3")}>{doc.error ?? doc.summary}</p>
        )}
        {doc.tags && doc.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {doc.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-line/40 px-2 py-0.5 text-[10px] text-ink-2">
                {tag.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}
      </div>
      {doc.status === "failed" && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-surface hover:text-ink"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Retry
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${doc.name}`}
        className="shrink-0 rounded-lg p-2 text-ink-3 opacity-0 transition-colors group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-500 focus-visible:opacity-100"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}

const UPLOAD_KINDS = ["pdf", "docx", "txt", "md"] as const;

function UploadModal({ open, onClose, onUpload }: { open: boolean; onClose: () => void; onUpload: (doc: TrainingDocument) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setTitle("");
    setSummary("");
    setTags("");
  }

  function pick(f: File) {
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
  }

  function submit() {
    if (!title.trim()) return;
    const ext = file?.name.split(".").pop()?.toLowerCase();
    onUpload({
      id: `doc-${Date.now()}`,
      name: file?.name ?? title.trim(),
      kind: UPLOAD_KINDS.find((k) => k === ext) ?? "txt",
      sizeKb: file ? Math.max(1, Math.round(file.size / 1024)) : null,
      uploadedAt: NOW.toISOString(),
      status: "pending",
      sections: null,
      summary: summary.trim() || undefined,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      uploadedBy: CURRENT_USER.name,
    });
    reset();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Upload Training Document"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-bg">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!title.trim()} className={primaryGreen}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Upload &amp; Index
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) pick(f);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors",
            dragOver ? "border-[#2ec27e] bg-[#2ec27e]/5" : "border-line hover:border-ink-3",
          )}
        >
          <Upload className={cn("h-6 w-6", dragOver ? "text-[#2ec27e]" : "text-ink-3")} aria-hidden="true" />
          {file ? (
            <span className="text-sm font-medium text-ink">{file.name}</span>
          ) : (
            <>
              <span className="text-sm text-ink-2">Drop a file here or click to browse</span>
              <span className="text-xs text-ink-3">PDF, DOCX, TXT, or Markdown</span>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pick(f);
            e.target.value = "";
          }}
        />
        <label className="block">
          <span className={labelClass}>Document Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sermon Series: Hope in Hard Times" className={fieldClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Content Summary (optional)</span>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            placeholder="Brief description of what this document contains…"
            className={cn(fieldClass, "resize-none")}
          />
        </label>
        <label className="block pb-1">
          <span className={labelClass}>Tags (comma-separated)</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="sermons, hope, pastoral-care" className={fieldClass} />
        </label>
      </div>
    </Modal>
  );
}

// ── Guardrails ─────────────────────────────────────────────────────

function GuardrailsTab({ bot, onChange }: { bot: Chatbot; onChange: (change: BotChange) => void }) {
  const [adding, setAdding] = useState(false);
  const active = bot.guardrails.filter((g) => g.active).length;

  return (
    <div>
      <TabHeader
        title="Guardrails & Safety Rules"
        description={`${active} of ${bot.guardrails.length} rules active — define what the AI can and cannot do.`}
        action={
          <button type="button" onClick={() => setAdding(true)} className={primaryGreen}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Guardrail
          </button>
        }
      />

      {bot.guardrails.length === 0 ? (
        <EmptyTab icon={Shield} title="No guardrails configured." body="Add rules to keep your AI assistant safe and aligned with your church's values." />
      ) : (
        <ul className="space-y-2">
          {bot.guardrails.map((rule) => (
            <GuardrailRow
              key={rule.id}
              rule={rule}
              onToggle={() => onChange((b) => ({ guardrails: b.guardrails.map((g) => (g.id === rule.id ? { ...g, active: !g.active } : g)) }))}
              onDelete={() => onChange((b) => ({ guardrails: b.guardrails.filter((g) => g.id !== rule.id) }))}
            />
          ))}
        </ul>
      )}

      <AddGuardrailModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(rule) => {
          onChange((b) => ({ guardrails: [rule, ...b.guardrails] }));
          setAdding(false);
        }}
      />
    </div>
  );
}

function GuardrailRow({ rule, onToggle, onDelete }: { rule: GuardrailRule; onToggle: () => void; onDelete: () => void }) {
  const type = RULE_TYPE[rule.type];
  const severity = SEVERITY[rule.severity];
  return (
    <li
      className={cn(
        "group animate-fade-in flex items-start gap-3 rounded-xl border p-3.5 transition-colors",
        rule.active ? "border-line/60 bg-surface" : "border-line/30 bg-bg/50 opacity-60",
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", severity.tile)}>
        <type.icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink">{type.label}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", severity.badge)}>{severity.label}</span>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{rule.text}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={rule.active}
          aria-label={rule.active ? "Deactivate rule" : "Activate rule"}
          title={rule.active ? "Deactivate" : "Activate"}
          className={cn(
            "rounded-lg p-2 transition-colors",
            rule.active ? "text-[#2ec27e] hover:bg-[#2ec27e]/10" : "text-ink-3 hover:bg-line/40",
          )}
        >
          {rule.active ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete rule"
          className="rounded-lg p-2 text-ink-3 opacity-0 transition-colors group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-500 focus-visible:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

function AddGuardrailModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (rule: GuardrailRule) => void }) {
  const [type, setType] = useState<GuardrailRuleType>("blocked_topic");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [text, setText] = useState("");

  function submit() {
    if (!text.trim()) return;
    onAdd({ id: `rule-${Date.now()}`, type, severity, text: text.trim(), active: true });
    setText("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Guardrail Rule"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-bg">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!text.trim()} className={primaryGreen}>
            <Shield className="h-4 w-4" aria-hidden="true" />
            Add Rule
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className={labelClass}>Rule Type</legend>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(RULE_TYPE) as GuardrailRuleType[]).map((t) => {
              const Icon = RULE_TYPE[t].icon;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  aria-pressed={type === t}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors",
                    type === t ? "border-[#1a2e2a] bg-[#1a2e2a] text-white" : "border-line bg-surface text-ink-2 hover:border-ink-3",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {RULE_TYPE[t].label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className={labelClass}>Severity</legend>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(SEVERITY) as Severity[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                aria-pressed={severity === s}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  severity === s ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-ink-3",
                )}
              >
                {SEVERITY[s].label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block pb-1">
          <span className={labelClass}>Rule Description</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Describe the rule in plain language… e.g. 'Never provide specific financial advice. Refer to a pastor or financial counselor.'"
            className={cn(fieldClass, "resize-none")}
          />
        </label>
      </div>
    </Modal>
  );
}

// ── Persona & Tone ─────────────────────────────────────────────────

function PersonaTab({ bot, onChange }: { bot: Chatbot; onChange: (change: BotChange) => void }) {
  const toast = useToast();
  const [prompt, setPrompt] = useState(bot.prompt);
  const [tone, setTone] = useState<ChatbotTone>(bot.tone);
  const training = bot.status === "training";
  const dirty = prompt !== bot.prompt || TONE_SLIDERS.some(({ key }) => tone[key] !== bot.tone[key]);

  function retrain() {
    onChange(() => ({ status: "training", lastTrainedAt: NOW.toISOString() }));
    window.setTimeout(() => {
      onChange(() => ({ status: "active" }));
      toast(`${bot.name} retrained`);
    }, 3000);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-ink uppercase">
          <Sparkles className="h-4 w-4 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
          System Prompt
        </h2>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={8}
          aria-label="System prompt"
          placeholder="Define the AI's personality, role, and behavioral guidelines…"
          className="w-full resize-none rounded-xl border border-line px-4 py-3 text-sm leading-relaxed text-ink transition outline-none focus:border-[#2ec27e] focus:ring-2 focus:ring-[#2ec27e]/20"
        />
        <p className="mt-2 text-xs text-ink-3">This prompt is sent to the AI as its core identity and behavioral instructions.</p>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-ink uppercase">
          <SlidersHorizontal className="h-4 w-4 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
          Tone &amp; Personality
        </h2>
        <div className="space-y-5 rounded-xl border border-line/60 bg-bg/50 p-5">
          {TONE_SLIDERS.map(({ key, label, hint }) => (
            <label key={key} className="block">
              <span className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-ink">{label}</span>
                <span className="text-xs text-ink-3 tabular-nums">{tone[key]}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={tone[key]}
                onChange={(e) => setTone((t) => ({ ...t, [key]: Number(e.target.value) }))}
                className="w-full accent-[#2ec27e]"
              />
              <span className="mt-1 block text-[11px] text-ink-3">{hint}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/40 pt-4 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onChange((b) => ({ status: b.status === "active" ? "paused" : "active" }))}
            disabled={training}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
              bot.status === "active"
                ? "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
            )}
          >
            {bot.status === "active" ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            {bot.status === "active" ? "Pause Bot" : "Activate Bot"}
          </button>
          <button
            type="button"
            onClick={retrain}
            disabled={training}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
          >
            {training ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {training ? "Training…" : "Retrain"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(() => ({ prompt, tone }));
            toast("Persona & tone saved");
          }}
          disabled={!dirty}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1a2e2a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#245045] disabled:opacity-50"
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          Save Changes
        </button>
      </div>
    </div>
  );
}

// ── New chatbot ────────────────────────────────────────────────────

function CreateBotModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (bot: Chatbot) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");

  function submit() {
    if (!name.trim()) return;
    onCreate({
      id: `bot-${Date.now()}`,
      name: name.trim(),
      model: "gpt-4o",
      description: description.trim() || null,
      status: "draft",
      lastTrainedAt: null,
      prompt: prompt.trim() || DEFAULT_PROMPT,
      tone: { warmth: 80, directness: 50, formality: 30, scripture: 60 },
      documents: [],
      guardrails: [],
    });
    setName("");
    setDescription("");
    setPrompt("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create New Chatbot"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-bg">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!name.trim()} className={primaryGreen}>
            <Bot className="h-4 w-4" aria-hidden="true" />
            Create Chatbot
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className={labelClass}>Chatbot Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Welcome Assistant, Prayer Companion" className={fieldClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What will this chatbot do?"
            className={cn(fieldClass, "resize-none")}
          />
        </label>
        <label className="block pb-1">
          <span className={labelClass}>System Prompt (optional)</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Define the AI's personality and behavioral guidelines…"
            className={cn(fieldClass, "resize-none")}
          />
        </label>
      </div>
    </Modal>
  );
}
