import "server-only";

import { classify, createModelClient, type ClassifyLabel, type ModelClient } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { renderFirstMessage, type FirstMessageContext, type FirstMessageFamily } from "./first-message";
import type { FirstMessageReview } from "./types";

// AI-07 / guidelines §5: the frontier model (Tier-2) reviews every first-contact family's wording
// before the pastor approves it. Its findings are advice shown next to the Approve button; the
// pastor decides. The wording is the church's own template (sample name filled in), never a
// guest's message, so it may go to the model before AI-02. Stored against the exact wording it
// reviewed (record_first_message_review drops a review of wording that has since changed).

type ReviewLabel = "fine" | "claims_human" | "pressure" | "doctrine" | "sensitive" | "off_tone" | "unclear";

export const REVIEW_LABELS: readonly ClassifyLabel<ReviewLabel>[] = [
  { id: "fine", description: "Warm, clear and appropriate as a church's first text to someone who just visited. Use only if nothing else applies." },
  { id: "claims_human", description: "Says or implies the sender is a person (a pastor, a volunteer, 'I'm Sarah') rather than the church's assistant." },
  { id: "pressure", description: "Pushes the guest: guilt, urgency, asks for money, a commitment or personal information." },
  { id: "doctrine", description: "States a belief, a theological claim or a position on a contested issue." },
  { id: "sensitive", description: "Mentions or asks about prayer needs, health, grief, family problems, money or other private matters." },
  { id: "off_tone", description: "Doesn't match the church's described tone." },
  { id: "unclear", description: "Confusing, awkward or likely to read as spam to the guest." },
];


export async function reviewFirstMessage(
  body: string,
  ctx: FirstMessageContext & { tone: string[]; family: FirstMessageFamily },
  client: ModelClient = createModelClient("onboarding"),
): Promise<FirstMessageReview> {
  const reviewedAt = new Date().toISOString();
  const r = await classify(client, {
    task: [
      `A church (${ctx.churchName || "a church"}) will send this as its first text to someone who visited it today${
        ctx.family === "family" ? ", for guests who came with children" : ctx.family === "returning" ? ", for guests who have visited before" : ""
      }. The church's chosen tone: ${ctx.tone.length ? ctx.tone.join(", ") : "warm and friendly"}.`,
      "Review the wording as the church's careful communications lead would. Which of these apply?",
    ].join(" "),
    labels: REVIEW_LABELS,
    input: renderFirstMessage(body, ctx, "Jordan"),
    multi: true,
    role: "frontier",
    // An unusable answer is not a pass.
    fallback: ["unclear"],
  });
  if (r.fallback && (r.reason === "config_error" || r.reason === "provider_error")) {
    return { verdict: "unavailable", labels: [], model: null, reviewedAt };
  }
  const labels = r.labels.filter((l): l is Exclude<ReviewLabel, "fine"> => l !== "fine");
  return { verdict: labels.length ? "concerns" : "pass", labels, model: r.completion?.model ?? null, reviewedAt };
}

/** Reviews and stores the review (service role). Never throws: a failed review is just "unavailable". */
export async function reviewAndRecord(
  churchId: string,
  family: FirstMessageFamily,
  body: string,
  ctx: FirstMessageContext & { tone: string[] },
): Promise<FirstMessageReview> {
  let review: FirstMessageReview;
  try {
    review = await reviewFirstMessage(body, { ...ctx, family });
  } catch {
    review = { verdict: "unavailable", labels: [], model: null, reviewedAt: new Date().toISOString() };
  }
  const admin = createAdminClient();
  if (admin) {
    const { error } = await admin.rpc("record_first_message_review", {
      p_church: churchId,
      p_family: family,
      p_body: body,
      p_review: { verdict: review.verdict, labels: review.labels, model: review.model, reviewed_at: review.reviewedAt },
    });
    if (error) log("settings.first_message_review_error", { church_id: churchId, family, code: error.code });
  }
  log("settings.first_message_reviewed", { church_id: churchId, family, verdict: review.verdict, labels: review.labels.length });
  return review;
}
