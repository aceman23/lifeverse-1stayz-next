export type PillTone = "green" | "amber" | "gray";

const TONES: Record<PillTone, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  gray: "bg-stone-100 text-stone-500 border-stone-200",
};

const DOTS: Record<PillTone, string> = {
  green: "bg-[#10B981]",
  amber: "bg-[#F59E0B]",
  gray: "bg-stone-300",
};

export default function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TONES[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}
