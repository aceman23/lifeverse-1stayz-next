/** Optional greeting/summary line at the top of a page body, under the shell header. */
export default function PageIntro({ title, children, actions }: { title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="animate-fade-in mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{title}</h2>
        {children && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-2">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
