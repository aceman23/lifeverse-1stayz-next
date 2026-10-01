import { daysAgo, hoursAgo } from "./clock";
import type { Guardrail, ToneSettings, TrainingDocument } from "./types";

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
