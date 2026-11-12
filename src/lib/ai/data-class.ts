import type { ClassifyLabel } from "./classify";

// Data classes for messages (AI Architecture & Data Isolation Guidelines §3):
//   C3  sensitive content: prayer, care needs, grief, health, crisis, counselling, salvation
//   C1  direct identifiers: names, phone numbers, email and street addresses
//   C2  everything else a guest writes (the rest of the classes don't apply to message text)
// Rules run first; the fast model only answers what the rules can't settle. Every step errs
// toward the stricter class: C3 over C1 over C2.

export type MessageClass = "C1" | "C2" | "C3";

/** Sensitive (C3) topics. Matching any one is enough; the model is not asked. */
export const SENSITIVE: { id: string; pattern: RegExp }[] = [
  { id: "prayer", pattern: /\b(pray|prayers?|praying)\b/i },
  { id: "grief", pattern: /\b(passed away|passed on|died|dying|death|funeral|grief|grieving|mourning|lost my|miscarr\w*|widow\w*)\b/i },
  { id: "health", pattern: /\b(hospital\w*|cancer|chemo\w*|surgery|diagnos\w*|sick|illness|disease|icu|hospice|stroke|heart attack)\b/i },
  {
    id: "crisis",
    pattern:
      /\b(suicid\w*|kill (myself|me)|end (my life|it all)|ending (my life|it all)|self[- ]harm|hurt(ing)? myself|cutting myself|want(ed)? to die|don'?t want to (live|be here)|no point (in )?living|don'?t see the point|overdos\w*|not safe)\b/i,
  },
  { id: "abuse", pattern: /\b(abus\w*|assault\w*|violen\w*|domestic|beat(s|ing)? me|hit(s|ting)? me|hurt(s|ing)? me|threaten\w*)\b/i },
  { id: "mental_health", pattern: /\b(depress\w*|anxiety|panic attacks?|mental health|therap(y|ist)|counsel(l?ing|or)|breakdown)\b/i },
  { id: "addiction", pattern: /\b(addict\w*|alcoholi\w*|sober|sobriety|relapse\w*|rehab|recovery program)\b/i },
  { id: "family_conflict", pattern: /\b(divorc\w*|separat(ed|ion)|affair|custody|marriage (is|was) (falling|in trouble))\b/i },
  { id: "hardship", pattern: /\b(evict\w*|homeless|can'?t (pay|afford)|lost my job|laid off|food bank|benevolence)\b/i },
  { id: "faith_journey", pattern: /\b(get saved|be saved|accept(ed)? (jesus|christ)|salvation|baptiz\w*|my sins?|forgive(n|ness))\b/i },
  { id: "hard_season", pattern: /\b(struggl\w*|hurting|hard (time|month|season|week)|going through)\b/i },
];

const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/;
const STREET = /\b\d{1,6}\s+(?:[A-Z0-9][\w.'-]*\s+){1,4}(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|way|pl|place|cir|circle|pkwy|parkway|hwy|highway)\b\.?/i;

export interface RuleResult {
  /** Sensitive topics found (C3). */
  sensitive: string[];
  /** Identifier kinds found (C1): phone, email, address, name. */
  identifiers: string[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Rule checks on a message. `names` are the guest's and household's names (from the server). */
export function applyRules(text: string, names: readonly string[] = []): RuleResult {
  const sensitive = SENSITIVE.filter((r) => r.pattern.test(text)).map((r) => r.id);
  const identifiers: string[] = [];
  if (PHONE.test(text)) identifiers.push("phone");
  if (EMAIL.test(text)) identifiers.push("email");
  if (STREET.test(text)) identifiers.push("address");
  const found = names
    .map((n) => n.trim())
    .filter((n) => n.length >= 2)
    .some((n) => new RegExp(`(^|[^\\p{L}])${escapeRe(n)}($|[^\\p{L}])`, "iu").test(text));
  if (found) identifiers.push("name");
  return { sensitive, identifiers };
}

/** What the model is asked when the rules found nothing sensitive. */
export type DataClassLabel = "sensitive" | "identifying" | "ordinary";

export const DATA_CLASS_TASK =
  "You help a church's welcome team protect guests' privacy. Decide what kind of information this message contains.";

export const DATA_CLASS_LABELS: readonly ClassifyLabel<DataClassLabel>[] = [
  {
    id: "sensitive",
    description:
      "prayer requests, care needs, grief, health, crisis or safety, abuse, addiction, mental health, family conflict, money hardship, or someone's faith journey or salvation",
  },
  { id: "identifying", description: "a person's name, phone number, email address, street address or other detail that identifies someone" },
  { id: "ordinary", description: "none of the above, e.g. questions about service times, kids' programs, parking or groups" },
];

/** If the model can't answer, assume the strictest. (The tagger doesn't save a fallback; it retries.) */
export const DATA_CLASS_FALLBACK: readonly DataClassLabel[] = ["sensitive"];

/** The class from the rules alone, or null when the model must decide. */
export function classFromRules(rules: RuleResult): MessageClass | null {
  return rules.sensitive.length > 0 ? "C3" : null;
}

/** Combines the rules and the model's labels, keeping whichever is stricter. */
export function combineClass(rules: RuleResult, labels: readonly DataClassLabel[]): MessageClass {
  if (rules.sensitive.length > 0 || labels.includes("sensitive")) return "C3";
  if (rules.identifiers.length > 0 || labels.includes("identifying")) return "C1";
  return "C2";
}
