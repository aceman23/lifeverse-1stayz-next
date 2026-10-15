"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Send, X } from "lucide-react";
import { DEMO_COOKIE } from "@/lib/demo";

// Login and sign-up: fixed answers to a few questions, no AI.
const SUGGESTIONS: Record<string, string> = {
  "What is Agentic AI digital assistants?":
    "Agentic AI digital assistants are AI helpers that act on your behalf. In 1Stayz, they follow up with each first-time guest through personal, timely messages so nobody slips through the cracks.",
  "How do I get access?":
    "1Stayz is currently in a pilot. Tap “Create an account” on this page, or continue with Google or Apple, to get started.",
  "What does this system do?":
    "1Stayz helps your church retain first-time visitors. It keeps track of new guests and engages each one with personalized follow-up that feels genuinely human.",
  "Is my church's data secure?":
    "Yes. Your data is encrypted in transit and at rest, access is limited to your team, and it is never sold or shared.",
};

// Dashboard: starter questions sent to the AI like anything the user types.
const DASHBOARD_SUGGESTIONS = [
  "What is Approval Mode?",
  "How do escalations work?",
  "How do I change my first message?",
];

const DEMO_REPLY =
  "In the demo I can't reach the live assistant. Sign in to your church's account to ask me anything about 1Stayz.";

type Message = { from: "user" | "grace"; text: string };

function hasDemoCookie() {
  return document.cookie.split("; ").some((c) => c === `${DEMO_COOKIE}=1`);
}

async function askAi(history: Message[]): Promise<string> {
  const res = await fetch("/api/ai-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: history.map((m) => ({ role: m.from === "grace" ? "assistant" : "user", content: m.text })),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok || !data.text) throw new Error(data.error || "The AI assistant is temporarily unavailable.");
  return data.text;
}

/**
 * Ask 1Stayz. `login` (login and sign-up pages) answers fixed questions. `dashboard` (the app
 * shell) sends questions to /api/ai-chat; demo visitors get a canned reply instead.
 */
export default function ChatWidget({ context = "login" }: { context?: "login" | "dashboard" }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { from: "grace", text: "Hi, I'm Grace. How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dashboard = context === "dashboard";

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    document.addEventListener("open-chat-widget", handleOpen);
    return () => document.removeEventListener("open-chat-widget", handleOpen);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open, loading]);

  function askFixed(question: string) {
    setMessages((prev) => [...prev, { from: "user", text: question }, { from: "grace", text: SUGGESTIONS[question] }]);
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    const history: Message[] = [...messages, { from: "user", text: question }];
    setMessages(history);
    setInput("");
    setLoading(true);
    try {
      let reply: string;
      if (hasDemoCookie()) {
        await new Promise((resolve) => setTimeout(resolve, 900 + Math.random() * 500));
        reply = DEMO_REPLY;
      } else {
        reply = await askAi(history);
      }
      setMessages((prev) => [...prev, { from: "grace", text: reply }]);
    } catch (err) {
      const reply = err instanceof Error ? err.message : "The AI assistant is temporarily unavailable.";
      setMessages((prev) => [...prev, { from: "grace", text: reply }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    send(input);
  }

  const showStarters = dashboard && messages.length === 1;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          role="dialog"
          aria-label="Ask 1Stayz"
          className="flex max-h-[min(520px,calc(100vh-120px))] w-[min(360px,calc(100vw-40px))] flex-col overflow-hidden rounded-20 border border-line bg-surface shadow-xl"
        >
          <div className="flex items-center justify-between bg-btn px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Grace</p>
              <p className="text-xs text-white/70">1Stayz assistant</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Ask 1Stayz"
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto p-4" aria-live="polite">
            {messages.map((m, i) => (
              <p
                key={i}
                className={`max-w-[85%] whitespace-pre-line rounded-12 px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.from === "user" ? "ml-auto bg-btn text-white" : "bg-bg text-ink"
                }`}
              >
                {m.text}
              </p>
            ))}
            {loading && (
              <p className="max-w-[85%] rounded-12 bg-bg px-3.5 py-2.5 text-sm text-ink-3">Grace is typing…</p>
            )}
          </div>

          {(!dashboard || showStarters) && (
            <div className="flex flex-wrap gap-2 border-t border-line p-3">
              {(dashboard ? DASHBOARD_SUGGESTIONS : Object.keys(SUGGESTIONS)).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => (dashboard ? send(q) : askFixed(q))}
                  disabled={loading}
                  className="rounded-full border border-teal px-3 py-1.5 text-left text-xs font-medium text-teal-text transition hover:bg-success-tint disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {dashboard && (
            <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-line p-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about 1Stayz…"
                aria-label="Message"
                maxLength={8000}
                className="h-10 min-w-0 flex-1 rounded-12 border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-teal"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-12 bg-btn text-white transition disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Ask 1Stayz" : "Open Ask 1Stayz"}
        aria-expanded={open}
        className={`flex items-center justify-center gap-2 rounded-full shadow-lg transition-all duration-200 ${
          open ? "h-11 w-11 bg-stone-800 hover:bg-stone-700" : "h-14 bg-[#008f83] px-4 hover:scale-[1.02] hover:bg-[#00796f]"
        }`}
      >
        {open ? (
          <X className="h-5 w-5 text-white" />
        ) : (
          <>
            <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/80 bg-white/15">
              <Bot className="h-5 w-5 text-white" />
            </span>
            <span className="whitespace-nowrap text-sm font-semibold text-white">Ask 1Stayz</span>
          </>
        )}
      </button>
    </div>
  );
}
