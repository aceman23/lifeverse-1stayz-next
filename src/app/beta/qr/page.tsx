import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";
import QRCode from "qrcode";

export const metadata: Metadata = { title: "Beta QR Code · 1Stayz" };

/** Absolute URL of the signup form: NEXT_PUBLIC_SITE_URL if set, else the host serving this page. */
async function betaUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return `${configured}/beta`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/beta`;
}

export default async function BetaQrPage() {
  const url = await betaUrl();
  // Rendered on the server as an SVG string, so no QR code library ships to the browser.
  const svg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#10151a", light: "#ffffff" } });

  return (
    <main
      className="flex min-h-screen flex-col items-center px-6 py-12"
      style={{ background: "linear-gradient(160deg, #fdfbf3 0%, #fbf6e6 55%, #f8f3ea 100%)" }}
    >
      <Image
        src="/icons/ic_1stayz.png"
        alt="1Stayz"
        width={284}
        height={92}
        preload
        className="h-auto w-[132px] mix-blend-multiply"
      />

      <div className="flex w-full max-w-[400px] flex-1 flex-col items-center justify-center py-10 text-center">
        <div className="animate-slide-up w-full max-w-[320px] rounded-[28px] border border-line/70 bg-surface p-10 shadow-pop">
          <div
            role="img"
            aria-label={`QR code linking to ${url}`}
            className="aspect-square w-full [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>

        <h1 className="mt-12 text-2xl font-bold tracking-[-0.02em] text-ink">Scan to Join the Beta</h1>
        <p className="mt-3 max-w-[330px] text-sm leading-relaxed text-ink-2">
          Point your phone camera here to sign up for early access to 1Stayz in under 30 seconds.
        </p>

        <Link href="/beta" className="mt-8 max-w-full truncate text-xs text-ink-3/80 transition hover:text-ink-2">
          {url}
        </Link>

        <Link href="/login" className="mt-5 inline-flex items-center gap-1.5 text-sm text-ink-2 transition hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to login
        </Link>
      </div>

      <Image src="/icons/ic_lifeverse_vertical1.png" alt="Lifeverse" width={61} height={40} className="h-11 w-auto opacity-70" />
    </main>
  );
}
