import { applyRules } from "./data-class";

// DB-07 (guidelines §4.4): the rendered prompt of every model call is kept in the church's own
// prompt log with C1 and C3 masked, so staff can review what the assistant was shown without the
// log becoming a second copy of guests' private details.
//   C1  names (guest and household), phone numbers, email and street addresses -> [name] etc.
//   C3  any message that touches a sensitive topic -> "[sensitive message: prayer, grief]"

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /(?<![\w-])\+?\(?\d[\d\s().-]{8,}\d(?![\w-])/g;
const STREET =
  /\b\d{1,6}\s+(?:[A-Z0-9][\w.'-]*\s+){1,4}(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|way|pl|place|cir|circle|pkwy|parkway|hwy|highway)\b\.?/gi;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const MAX_MASKED_PROMPT = 8000;

/** C1 masking for any text. */
export function maskIdentifiers(text: string, names: readonly string[] = []): string {
  let out = text
    .replace(EMAIL, "[email]")
    .replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 10 ? "[phone]" : m))
    .replace(STREET, "[address]");
  for (const n of [...new Set(names.map((x) => x.trim()).filter((x) => x.length >= 2))].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`(^|[^\\p{L}])${escapeRe(n)}(?=$|[^\\p{L}])`, "giu"), "$1[name]");
  }
  return out;
}

/** One message: C3 replaced whole (topic labels only), otherwise C1 masked. */
export function maskMessage(text: string, names: readonly string[] = []): string {
  const { sensitive } = applyRules(text);
  if (sensitive.length) return `[sensitive message: ${sensitive.join(", ")}]`;
  return maskIdentifiers(text, names);
}

export interface PromptToMask {
  system?: string;
  messages: { role: string; content: string }[];
}

/** The whole prompt as one masked text: system first, then each turn. Capped in length. */
export function maskPrompt(prompt: PromptToMask, names: readonly string[] = []): string {
  const parts = [
    prompt.system ? `[system]\n${maskIdentifiers(prompt.system, names)}` : null,
    ...prompt.messages.map((m) => `[${m.role}]\n${maskMessage(m.content, names)}`),
  ].filter((p): p is string => p !== null);
  const text = parts.join("\n\n");
  return text.length > MAX_MASKED_PROMPT ? `${text.slice(0, MAX_MASKED_PROMPT)}\n[truncated]` : text;
}
