import Image from "next/image";

/** Photo panel on the left of the sign-in and sign-up screens (desktop only). */
export default function AuthSidePanel() {
  return (
    <div className="relative hidden overflow-hidden p-16 lg:flex lg:w-1/2 lg:items-end">
      <Image
        src="/images/login-bg.jpg"
        alt=""
        fill
        sizes="50vw"
        loading="eager"
        className="object-cover opacity-35"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, var(--background) 0%, transparent 40%, transparent 60%, var(--background) 100%)",
        }}
      />
      <div className="relative z-10">
        <h2 className="mb-4 text-[44px] font-bold leading-tight tracking-[-0.02em] text-ink">
          Retain more of your
          <br />
          first-time visitors.
        </h2>
        <p className="max-w-md text-lg leading-relaxed text-ink-2">
          1Stayz follows up with every guest through intelligent, personalized
          engagement that feels genuinely human.
        </p>
        <div className="mt-12">
          <Image
            src="/icons/ic_lifeverse_vertical1.png"
            alt="Lifeverse"
            width={61}
            height={40}
            className="h-10 w-auto opacity-50"
          />
        </div>
      </div>
    </div>
  );
}
