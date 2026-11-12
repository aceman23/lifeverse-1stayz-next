// Shown while guests load from Supabase.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading people" className="animate-pulse">
      <div className="mb-6 h-8 w-40 rounded-lg bg-line/50" />
      <div className="mb-5 h-11 rounded-xl bg-line/40" />
      <div className="space-y-2.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[88px] rounded-2xl border border-line/60 bg-surface" />
        ))}
      </div>
    </div>
  );
}
