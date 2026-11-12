import { NextResponse } from "next/server";
import { createModelClient, ModelConfigError, type ChatMessage } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/log";

// Ask 1Stayz: the in-app help chat. Signed-in users only. Uses the team's server-side keys
// (src/lib/ai), never a key from the browser.
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 30;
const MAX_CHARS = 8000;

const SYSTEM = `You are Grace, the in-app assistant for 1Stayz by Lifeverse. Church staff use 1Stayz to follow up with first-time guests: it texts each guest after the service they attended, answers their questions in the church's voice, and routes sensitive conversations to a pastor.

Help staff use the product: onboarding steps, guardrails and escalation topics, the team and escalation order, the first message and consent wording, the modes (Shadow mode: the assistant drafts every message and staff approve before anything is sent; Live mode: routine messages send automatically and escalations still go to a person; switch in the mode pill at the top right), and the app's pages (Today, Progress, Guests, Conversations, Train Your AI, Sequences, Appointments, Insights, Settings). Settings › Service Schedule: each service has a pencil (Edit) and a trash can (Remove), and Add service at the bottom; any team member can change it. Settings › Team & Escalations (church owner only): each person has a pencil (Edit) that opens their name, role, email, mobile and what they get (Needs a pastor, Care requests, General questions), with Done and Remove; Add a person at the bottom. The Escalation order is changed with the up and down arrow buttons next to each name (there is no dragging). Then press Save team. Settings › Guardrails › Beliefs and practices: for each topic choose Explain, Route to a pastor or Skip; Explain needs the church's approved wording, up to 10,000 characters, and guests get a short text drawn from it. Settings › First Message: it must greet the guest with {first_name}, include "Reply STOP to opt out", ask at most one question and have no unfilled placeholders like [Name]; up to 4 texts can be saved, 2 or fewer is recommended. Curly quotes and dashes are fine (they're sent as plain ones); emoji make each text hold less. The reason Save is greyed out is shown above the Save button. The account menu (bottom of the sidebar, or the avatar at the top right) has Edit name, Settings and Sign out.

Keep answers short and practical: a few sentences, or a short list when there are steps. Format lightly: **bold** for a label or button name and "- " bullets are fine; no headings, tables or nested lists. If you don't know something about the church's own data, say so and point to the page where they can check. Don't invent features or buttons: only describe controls named here, and if you're not sure where something is, say which page to check. Don't give theological, medical, legal or counseling advice; suggest they talk with their pastor or a professional.`;

/** Keeps well-formed messages, trims to the last MAX_MESSAGES, and starts on a user turn. */
function normalize(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const messages = input
    .filter(
      (m): m is ChatMessage =>
        typeof m === "object" &&
        m !== null &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
    .slice(-MAX_MESSAGES);
  // The widget opens with Grace's greeting; providers want the conversation to start with the user.
  while (messages[0]?.role === "assistant") messages.shift();
  return messages.at(-1)?.role === "user" ? messages : [];
}

export async function POST(request: Request) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase isn't configured for this environment." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const messages = normalize(body.messages);
  if (messages.length === 0) {
    return NextResponse.json({ error: "Add a message before sending." }, { status: 400 });
  }

  try {
    const reply = await createModelClient("onboarding").complete({
      role: "fast",
      system: SYSTEM,
      messages,
      maxTokens: 600,
    });
    const text = reply.text.trim();
    if (!text) {
      return NextResponse.json({ error: "The AI assistant returned an empty response." }, { status: 502 });
    }
    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof ModelConfigError) {
      logError("ai_chat.not_configured", { message: err.message });
      return NextResponse.json({ error: "The AI assistant isn't set up for this environment yet." }, { status: 503 });
    }
    return NextResponse.json({ error: "The AI assistant is temporarily unavailable." }, { status: 502 });
  }
}
