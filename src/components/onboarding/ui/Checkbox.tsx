"use client";

import { useId } from "react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}

export default function Checkbox({ checked, onChange, children }: CheckboxProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-[#10B981]"
      />
      <label htmlFor={id} className="cursor-pointer text-sm leading-snug text-stone-600">
        {children}
      </label>
    </div>
  );
}
