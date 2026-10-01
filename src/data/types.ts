// Row shapes for the mock data. Each mirrors a future Supabase table, so swapping a
// `src/data/*.ts` export for a query only changes where the rows come from.

export type Channel = "sms" | "email" | "web";

export type PipelineStage =
  | "new"
  | "thanked"
  | "contacted"
  | "engaged"
  | "escalated"
  | "scheduled"
  | "returned"
  | "integrated";

export type WorkspaceMode = "setup" | "shadow" | "live";

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  /** Receives escalations for these topics. */
  escalationTopics: string[];
}

export interface HouseholdMember {
  name: string;
  relation: "spouse" | "child" | "parent" | "other";
  age?: number;
}

export type EngagementKind = "visit" | "message" | "reply" | "stage" | "meeting" | "note";

export interface EngagementEvent {
  id: string;
  at: string;
  kind: EngagementKind;
  title: string;
  detail?: string;
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredChannel: Channel;
  stage: PipelineStage;
  needsAttention: boolean;
  firstVisitAt: string;
  lastContactAt: string;
  visitCount: number;
  source: "Connect card" | "Subsplash" | "Website" | "Text-in";
  city: string;
  household: HouseholdMember[];
  /** Facts the assistant learned from conversations, shown under "What we know". */
  facts: string[];
  interests: string[];
  ownerId: string;
  timeline: EngagementEvent[];
}

export type ConversationStatus = "active" | "paused" | "taken_over" | "escalated";
export type ConversationOutcome = "resolved" | "escalated" | "no_action" | "follow_up";

export interface Message {
  id: string;
  from: "guest" | "assistant" | "staff";
  body: string;
  at: string;
  /** Staff member who sent it, for `from: "staff"`. */
  authorId?: string;
}

export interface Conversation {
  id: string;
  personId: string;
  channel: Channel;
  status: ConversationStatus;
  outcome: ConversationOutcome | null;
  unread: number;
  summary: string;
  messages: Message[];
}

export type TodayStatus = "escalation" | "draft_ready" | "replied" | "needs_follow_up" | "upcoming" | "sunday_prep";

export interface TodayItem {
  id: string;
  status: TodayStatus;
  personId: string | null;
  title: string;
  detail: string;
  /** Message the assistant drafted and is waiting to send. */
  draft?: string;
  channel?: Channel;
  dueAt: string;
}

export type DocumentStatus = "indexed" | "processing" | "pending" | "failed";

export interface TrainingDocument {
  id: string;
  name: string;
  kind: "pdf" | "docx" | "txt" | "url";
  sizeKb: number | null;
  uploadedAt: string;
  status: DocumentStatus;
  sections: number | null;
  error?: string;
}

export type Severity = "low" | "medium" | "high" | "critical";
export type GuardrailStance = "explain" | "route" | "skip";

export interface Guardrail {
  id: string;
  topic: string;
  description: string;
  severity: Severity;
  stance: GuardrailStance;
  routeToId?: string;
}

export interface ToneSettings {
  warmth: number;
  formality: number;
  length: "brief" | "balanced" | "detailed";
  emoji: boolean;
  signOff: string;
  scriptureUse: "never" | "when_asked" | "gently";
}

export interface SequenceStep {
  id: string;
  day: number;
  channel: Channel;
  title: string;
  /** Email only. */
  subject?: string;
  /** Message template; supports {{first_name}} and {{church_name}}. */
  body: string;
  sent: number;
  replyRate: number;
}

export type BranchTrigger = "guest_replied" | "concern_detected" | "no_reply" | "second_visit";
export type BranchAction = "pause_and_assistant" | "escalate_care" | "switch_to_email" | "move_to_sequence";

/** If `trigger` happens while a guest is in the sequence, do `action`. */
export interface BranchRule {
  id: string;
  trigger: BranchTrigger;
  action: BranchAction;
  enabled: boolean;
  /** For "no_reply": unanswered touches before the rule fires. */
  afterTouches?: number;
  /** For "move_to_sequence". */
  targetSequenceId?: string;
}

export interface Sequence {
  id: string;
  name: string;
  audience: string;
  active: boolean;
  enrolled: number;
  completed: number;
  steps: SequenceStep[];
  rules: BranchRule[];
}

export interface Enrollment {
  id: string;
  personId: string;
  sequenceId: string;
  /** Next step to send. */
  stepId: string;
  status: "active" | "paused";
  lastTouchAt: string | null;
  nextTouchAt: string;
}

export type AppointmentStatus = "confirmed" | "invited" | "proposed" | "declined" | "completed";

export interface Appointment {
  id: string;
  personId: string;
  hostId: string;
  kind: "coffee" | "meeting" | "tour" | "call";
  startsAt: string;
  durationMin: number;
  location: string;
  status: AppointmentStatus;
  note?: string;
  /** Times offered in the invite, for "invited" / "proposed". */
  offeredTimes?: string[];
  invitedAt?: string;
}

export interface SuggestedSlot {
  id: string;
  personId: string;
  hostId: string;
  startsAt: string;
  location: string;
  reason: string;
}

export interface Notification {
  id: string;
  kind: "escalation" | "reply" | "booking" | "system";
  title: string;
  body: string;
  at: string;
  read: boolean;
  href: string;
}
