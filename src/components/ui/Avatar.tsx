import { initials } from "@/lib/format";
import { cn } from "@/lib/cn";

// Muted, warm backgrounds; the pick is stable per name.
const PALETTE = [
  "bg-[#E8F4F2] text-[#01675D]",
  "bg-[#F3EEE6] text-[#7A5A2E]",
  "bg-[#EEF0F6] text-[#3B4A7A]",
  "bg-[#F6ECEE] text-[#8A3A4A]",
  "bg-[#EDF3E8] text-[#46612F]",
  "bg-[#F1ECF5] text-[#5E4478]",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const SIZES = { sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-xs", lg: "h-14 w-14 text-lg" };

export default function Avatar({ name, size = "md", className }: { name: string; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        PALETTE[hash(name) % PALETTE.length],
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
