"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";

const SUGGESTIONS: Record<string, string> = {
  "What is Agentic AI digital assistants?":
    "Agentic AI digital assistants are AI helpers that act on your behalf. In 1Stayz, they follow up with each first-time guest through personal, timely messages so nobody slips through the cracks.",
  "How do I get access?":
    "1Stayz is currently in a pilot. Tap “Join the Pilot” on this page to get started, or use “Try the demo” to look around first.",
  "What does this system do?":
    "1Stayz helps your church retain first-time visitors. It keeps track of new guests and engages each one with personalized follow-up that feels genuinely human.",
  "Is my church's data secure?":
    "Yes. Your data is encrypted in transit and at rest, access is limited to your team, and it is never sold or shared.",
};

type Message = { from: "user" | "grace"; text: string };

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { from: "grace", text: "Hi, I'm Grace. How can I help you today?" },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    document.addEventListener("open-chat-widget", handleOpen);
    return () => document.removeEventListener("open-chat-widget", handleOpen);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  function ask(question: string) {
    setMessages((prev) => [...prev, { from: "user", text: question }, { from: "grace", text: SUGGESTIONS[question] }]);
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          role="dialog"
          aria-label="Chat with Grace"
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
              aria-label="Close chat"
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <p
                key={i}
                className={`max-w-[85%] rounded-12 px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.from === "user" ? "ml-auto bg-btn text-white" : "bg-bg text-ink"
                }`}
              >
                {m.text}
              </p>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line p-3">
            {Object.keys(SUGGESTIONS).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
                className="rounded-full border border-teal px-3 py-1.5 text-left text-xs font-medium text-teal-text transition hover:bg-success-tint"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#262B30] text-white shadow-lg transition hover:scale-105"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
