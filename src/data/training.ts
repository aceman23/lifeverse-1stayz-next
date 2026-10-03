import { daysAgo, hoursAgo } from "./clock";
import type { Chatbot, Guardrail, ToneSettings, TrainingDocument } from "./types";

export const TRAINING_DOCUMENTS: TrainingDocument[] = [
  { id: "d1", name: "Grace Community Welcome Guide 2026.pdf", kind: "pdf", sizeKb: 2480, uploadedAt: daysAgo(21, 10), status: "indexed", sections: 42 },
  { id: "d2", name: "Statement of Faith.docx", kind: "docx", sizeKb: 64, uploadedAt: daysAgo(21, 10), status: "indexed", sections: 12 },
  { id: "d3", name: "Groups & Classes · Fall Semester.pdf", kind: "pdf", sizeKb: 1310, uploadedAt: daysAgo(9, 15), status: "indexed", sections: 27 },
  { id: "d4", name: "gracecommunity.org/kids", kind: "url", sizeKb: null, uploadedAt: daysAgo(6, 11), status: "indexed", sections: 9 },
  { id: "d5", name: "Child Safety Policy.pdf", kind: "pdf", sizeKb: 890, uploadedAt: hoursAgo(3), status: "processing", sections: null },
  { id: "d6", name: "Fall events calendar.txt", kind: "txt", sizeKb: 6, uploadedAt: hoursAgo(1), status: "pending", sections: null },
  { id: "d7", name: "Benevolence process (scanned).pdf", kind: "pdf", sizeKb: 15200, uploadedAt: daysAgo(2, 14), status: "failed", sections: null, error: "Scanned image with no readable text. Upload a text-based PDF." },
];

export const GUARDRAILS: Guardrail[] = [
  { id: "g1", topic: "Crisis & safety", description: "Self-harm, abuse, or someone in danger. Share 988 and notify a pastor immediately.", severity: "critical", stance: "route", routeToId: "s-ray" },
  { id: "g2", topic: "Grief & loss", description: "Recent deaths, miscarriage, terminal diagnoses.", severity: "high", stance: "route", routeToId: "s-mark" },
  { id: "g3", topic: "Marriage & divorce", description: "Relationship struggles, remarriage questions.", severity: "high", stance: "route", routeToId: "s-ray" },
  { id: "g4", topic: "Theology questions", description: "Doctrine beyond the Statement of Faith.", severity: "medium", stance: "route", routeToId: "s-ray" },
  { id: "g5", topic: "Giving & finances", description: "How to give, tax receipts. Never ask for money.", severity: "medium", stance: "explain" },
  { id: "g6", topic: "Benevolence requests", description: "Rent, utilities, groceries.", severity: "high", stance: "route", routeToId: "s-mark" },
  { id: "g7", topic: "Politics & elections", description: "Candidates, ballot measures, partisan issues.", severity: "medium", stance: "skip" },
  { id: "g8", topic: "Kids check-in & safety", description: "Check-in, allergies, classroom ratios.", severity: "low", stance: "explain" },
  { id: "g9", topic: "Other churches", description: "Comparisons or criticism of other congregations.", severity: "low", stance: "skip" },
];

export const TONE: ToneSettings = {
  warmth: 80,
  formality: 30,
  length: "brief",
  emoji: true,
  signOff: "The Grace Community team",
  scriptureUse: "when_asked",
};

const DOC_DETAILS: Record<string, Pick<TrainingDocument, "summary" | "tags" | "uploadedBy">> = {
  d1: { summary: "Service times, parking, kids check-in and what to expect on a first Sunday.", tags: ["welcome", "first_visit"], uploadedBy: "Jenna Cole" },
  d2: { summary: "Core beliefs the assistant may quote when guests ask what Grace believes.", tags: ["beliefs"], uploadedBy: "Ray Mitchell" },
  d3: { summary: "Every group meeting this fall, with leaders, times and childcare.", tags: ["groups", "childcare"], uploadedBy: "Jenna Cole" },
  d4: { tags: ["kids"], uploadedBy: "Jenna Cole" },
  d5: { tags: ["kids", "safety"], uploadedBy: "Mark Ochoa" },
  d6: { tags: ["events"], uploadedBy: "Jenna Cole" },
  d7: { tags: ["care"], uploadedBy: "Mark Ochoa" },
};

export const CHATBOTS: Chatbot[] = [
  {
    id: "bot-grace",
    name: "Grace — Pastoral Care Assistant",
    model: "gpt-4o",
    description: "Primary AI assistant for visitor engagement, follow-up conversations, and pastoral care support.",
    status: "active",
    lastTrainedAt: daysAgo(3, 15),
    prompt:
      "You are Grace, the welcome assistant for Grace Community Church in Springfield, IL. Write like a warm, unhurried church member: short messages, first names, no pressure. Answer only from the church's documents. When a guest shares grief, crisis, or a personal struggle, say a pastor will reach out and stop replying.",
    tone: { warmth: 80, directness: 50, formality: 30, scripture: 40 },
    documents: TRAINING_DOCUMENTS.map((d) => ({ ...d, ...DOC_DETAILS[d.id] })),
    guardrails: [
      { id: "r1", type: "escalation_trigger", severity: "critical", active: true, text: "Self-harm, abuse, or someone in danger: share the 988 Suicide & Crisis Lifeline and notify a pastor immediately." },
      { id: "r2", type: "escalation_trigger", severity: "high", active: true, text: "Grief, loss, or a terminal diagnosis: acknowledge gently, then route to Mark Ochoa for a personal call." },
      { id: "r3", type: "required_response", severity: "high", active: true, text: "Always tell guests a real person is nearby and can reply if they'd prefer." },
      { id: "r4", type: "content_boundary", severity: "medium", active: true, text: "Never ask for money. Explain how to give only when a guest asks." },
      { id: "r5", type: "blocked_topic", severity: "medium", active: true, text: "Do not discuss candidates, ballot measures, or partisan politics." },
      { id: "r6", type: "tone_constraint", severity: "low", active: false, text: "No more than one emoji per message, and none in serious conversations." },
    ],
  },
  {
    id: "bot-web",
    name: "Website Chat bot",
    model: "gpt-4o",
    description: null,
    status: "active",
    lastTrainedAt: daysAgo(7, 11),
    prompt: "You are a helpful pastoral care assistant.",
    tone: { warmth: 80, directness: 50, formality: 30, scripture: 60 },
    documents: [],
    guardrails: [],
  },
];
