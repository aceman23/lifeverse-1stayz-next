import { Hourglass } from "lucide-react";

/** Marks a page as a preview of a feature that isn't wired up yet. */
export default function SoonBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade-in flex items-start gap-3 rounded-xl border border-dashed border-line bg-surface/60 px-4 py-3 text-sm text-ink-2">
      <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
      <p>
        <span className="font-medium text-ink">Coming soon. </span>
        {children}
      </p>
    </div>
  );
}
