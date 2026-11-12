import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

const SIZES = { sm: "h-9 w-9 text-xs", md: "h-10 w-10 text-xs", lg: "h-12 w-12 text-sm" };

/** Guest initials on the brand's dark-green gradient; stands in until guests have photos. */
export default function GuestAvatar({ name, size = "sm", className }: { name: string; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1a2e2a] to-[#2ec27e] font-semibold text-white",
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
