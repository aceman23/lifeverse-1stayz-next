import type {
  ConversationOutcome,
  ConversationStatus,
  DocumentStatus,
  GuardrailStance,
  PipelineStage,
  Severity,
  WorkspaceMode,
} from "@/data/types";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "teal" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, { badge: string; dot: string }> = {
  neutral: { badge: "bg-bg text-ink-2 border-line", dot: "bg-ink-3" },
  teal: { badge: "bg-[#E8F4F2] text-teal-text border-[#BFE0DB]", dot: "bg-teal" },
  success: { badge: "bg-success-tint text-success border-[#C6EAD9]", dot: "bg-success" },
  warning: { badge: "bg-warning-tint text-warning border-[#F5DDB0]", dot: "bg-warning" },
  danger: { badge: "bg-danger-tint text-danger border-[#F5CCD2]", dot: "bg-danger" },
  info: { badge: "bg-info-tint text-info border-[#CCD9F7]", dot: "bg-info" },
};

interface StatusBadgeProps {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function StatusBadge({ tone = "neutral", dot = true, className, children }: StatusBadgeProps) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        t.badge,
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}

// Label and tone for each domain status, so every page renders them the same way.
type Spec = { label: string; tone: Tone };

export const STAGE_BADGE: Record<PipelineStage, Spec> = {
  new: { label: "New", tone: "info" },
  thanked: { label: "Thanked", tone: "neutral" },
  contacted: { label: "Contacted", tone: "neutral" },
  engaged: { label: "Engaged", tone: "teal" },
  escalated: { label: "Escalated", tone: "danger" },
  scheduled: { label: "Scheduled", tone: "warning" },
  returned: { label: "Returned", tone: "success" },
  integrated: { label: "Integrated", tone: "success" },
};

export const CONVERSATION_STATUS_BADGE: Record<ConversationStatus, Spec> = {
  active: { label: "Active", tone: "teal" },
  paused: { label: "Paused", tone: "neutral" },
  taken_over: { label: "Taken over", tone: "info" },
  escalated: { label: "Escalated", tone: "danger" },
};

export const OUTCOME_BADGE: Record<ConversationOutcome, Spec> = {
  resolved: { label: "Resolved", tone: "success" },
  escalated: { label: "Escalated", tone: "danger" },
  no_action: { label: "No Action Needed", tone: "neutral" },
  follow_up: { label: "Follow-Up Needed", tone: "warning" },
};

export const DOCUMENT_BADGE: Record<DocumentStatus, Spec> = {
  indexed: { label: "Indexed", tone: "success" },
  processing: { label: "Processing", tone: "info" },
  pending: { label: "Pending", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};

export const SEVERITY_BADGE: Record<Severity, Spec> = {
  low: { label: "Low", tone: "neutral" },
  medium: { label: "Medium", tone: "info" },
  high: { label: "High", tone: "warning" },
  critical: { label: "Critical", tone: "danger" },
};

export const STANCE_LABEL: Record<GuardrailStance, string> = {
  explain: "Explain",
  route: "Route to pastor",
  skip: "Skip",
};

export const MODE_BADGE: Record<WorkspaceMode, Spec> = {
  setup: { label: "Setup", tone: "neutral" },
  shadow: { label: "Shadow", tone: "warning" },
  live: { label: "Live", tone: "success" },
};
