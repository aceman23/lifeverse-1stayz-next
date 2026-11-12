// Shown while the church's settings load from Supabase. Mirrors the page's three columns.
export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading settings"
      className="grid animate-pulse grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_260px]"
    >
      <div className="hidden space-y-2 lg:block">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-9 rounded-lg bg-line/50" />
        ))}
      </div>
      <div className="h-[420px] rounded-xl border border-line bg-surface" />
      <div className="hidden h-[340px] rounded-xl border border-line bg-surface xl:block" />
    </div>
  );
}
