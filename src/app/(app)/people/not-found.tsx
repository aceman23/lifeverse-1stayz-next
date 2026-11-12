import Link from "next/link";
import { UserRoundX } from "lucide-react";

export default function PersonNotFound() {
  return (
    <div className="rounded-xl border border-line bg-surface px-6 py-16 text-center shadow-card">
      <UserRoundX className="mx-auto h-8 w-8 text-ink-3" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-ink">We couldn&apos;t find that guest</p>
      <p className="mt-1 text-sm text-ink-2">They may have been merged or removed.</p>
      <Link href="/people" className="mt-4 inline-block text-sm font-medium text-teal-text hover:underline">
        Back to People
      </Link>
    </div>
  );
}
