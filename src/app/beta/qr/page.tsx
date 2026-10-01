import Link from "next/link";
import { ArrowRight, QrCode } from "lucide-react";

export const metadata = { title: "Beta QR Code · 1Stayz" };

export default function BetaQrPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-[400px] text-center">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F4F2] text-teal">
          <QrCode className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink">Beta QR Code</h1>
        <p className="mt-2 text-base text-ink-2">
          Scanning the code opens the pilot signup form at <span className="font-medium text-ink">/beta</span>.
        </p>
        <Link
          href="/beta"
          className="mt-8 flex h-14 w-full items-center justify-between rounded-12 bg-btn px-5 text-sm font-semibold text-white transition"
        >
          Open the pilot signup form
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}
