"use client";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  /** Hide the text visually but keep it as the accessible name. */
  hideLabel?: boolean;
}

export default function Toggle({ checked, onChange, label, description, hideLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group inline-flex min-h-11 items-center gap-3 text-left"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[#10B981]" : "bg-stone-200"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
      <span className={hideLabel ? "sr-only" : "min-w-0"}>
        <span className="block text-sm text-stone-900">{label}</span>
        {description && <span className="block text-xs text-stone-400">{description}</span>}
      </span>
    </button>
  );
}
