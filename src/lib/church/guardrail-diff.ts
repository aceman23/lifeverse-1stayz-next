// AI-06: what changed between two approved guardrail versions (Settings > Guardrails > History).
// Works on the stored version config (church_guardrail_versions.config): tone, sign-off,
// beliefs and practices (topic, stance, wording), escalation topics, reference documents.

export interface GuardrailVersionConfig {
  tone?: string[] | null;
  sign_off?: string | null;
  positions?: { topic: string; stance: string; wording?: string | null }[] | null;
  escalation_topics?: string[] | null;
  documents?: string[] | null;
}

export interface GuardrailChange {
  kind: "added" | "removed" | "changed";
  area: "Tone" | "Sign-off" | "Belief or practice" | "Goes to a person" | "Reference document";
  text: string;
}

const STANCE: Record<string, string> = { explain: "answers with your wording", route: "goes to a pastor", skip: "doesn't discuss" };
const stance = (s: string) => STANCE[s] ?? s;
const norm = (s: string) => s.trim().toLowerCase();

function setDiff(prev: string[], next: string[], area: GuardrailChange["area"]): GuardrailChange[] {
  const p = new Map(prev.map((x) => [norm(x), x]));
  const n = new Map(next.map((x) => [norm(x), x]));
  return [
    ...[...n].filter(([k]) => !p.has(k)).map(([, v]): GuardrailChange => ({ kind: "added", area, text: v })),
    ...[...p].filter(([k]) => !n.has(k)).map(([, v]): GuardrailChange => ({ kind: "removed", area, text: v })),
  ];
}

/** Changes from `prev` to `next`. With no `prev` (the first version) everything is "added". */
export function diffGuardrails(prev: GuardrailVersionConfig | null, next: GuardrailVersionConfig): GuardrailChange[] {
  const p = prev ?? {};
  const out: GuardrailChange[] = [...setDiff(p.tone ?? [], next.tone ?? [], "Tone")];

  const before = (p.sign_off ?? "").trim();
  const after = (next.sign_off ?? "").trim();
  if (before !== after) {
    if (!before) out.push({ kind: "added", area: "Sign-off", text: after });
    else if (!after) out.push({ kind: "removed", area: "Sign-off", text: before });
    else out.push({ kind: "changed", area: "Sign-off", text: `“${before}” → “${after}”` });
  }

  const pp = new Map((p.positions ?? []).map((x) => [norm(x.topic), x]));
  const np = new Map((next.positions ?? []).map((x) => [norm(x.topic), x]));
  for (const [k, x] of np) {
    const old = pp.get(k);
    if (!old) out.push({ kind: "added", area: "Belief or practice", text: `${x.topic}: ${stance(x.stance)}` });
    else if (old.stance !== x.stance) out.push({ kind: "changed", area: "Belief or practice", text: `${x.topic}: ${stance(old.stance)} → ${stance(x.stance)}` });
    else if ((old.wording ?? "").trim() !== (x.wording ?? "").trim()) out.push({ kind: "changed", area: "Belief or practice", text: `${x.topic}: new wording` });
  }
  for (const [k, x] of pp) if (!np.has(k)) out.push({ kind: "removed", area: "Belief or practice", text: x.topic });

  out.push(...setDiff(p.escalation_topics ?? [], next.escalation_topics ?? [], "Goes to a person"));
  out.push(...setDiff(p.documents ?? [], next.documents ?? [], "Reference document"));
  return out;
}
