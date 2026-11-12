import Link from "next/link";
import { ArrowRight, Hourglass, type LucideIcon } from "lucide-react";

// What a real church sees on a page that isn't built on its own data yet. The demo workspace
// keeps the sample page, so nobody at a church ever sees invented guests.

export interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  /** One or two sentences: what this page will do for the church. */
  body: string;
  /** What to use in the meantime. */
  meanwhile: { href: string; label: string; detail: string }[];
}

export default function ComingSoonPage({ icon: Icon, title, body, meanwhile }: ComingSoonProps) {
  return (
    <section aria-labelledby="soon-title" className="animate-fade-in mx-auto max-w-xl py-6 sm:py-12">
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-ink-2">
            <Hourglass className="h-3 w-3 text-teal" aria-hidden="true" />
            Coming soon
          </span>
        </div>
        <h2 id="soon-title" className="mt-5 text-xl font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{body}</p>

        {meanwhile.length > 0 && (
          <>
            <p className="mt-6 text-xs font-medium tracking-wide text-ink-3 uppercase">In the meantime</p>
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {meanwhile.map((m) => (
                <li key={m.href}>
                  <Link
                    href={m.href}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg focus-visible:bg-bg"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{m.label}</span>
                      <span className="block text-xs text-ink-2">{m.detail}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
