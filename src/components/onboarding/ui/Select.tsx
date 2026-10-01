"use client";

import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { FieldShell, inputClass } from "./TextField";

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  icon?: LucideIcon;
  required?: boolean;
  className?: string;
}

export default function Select({ label, value, onChange, options, placeholder, icon, required, className }: SelectProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} icon={icon} className={className}>
      <select
        id={id}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} ${value ? "" : "text-stone-400"}`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o} className="text-stone-900">
            {o}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
