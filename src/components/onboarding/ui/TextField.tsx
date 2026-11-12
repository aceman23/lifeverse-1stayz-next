"use client";

import { useId } from "react";
import type { LucideIcon } from "lucide-react";

export const inputClass =
  "w-full min-h-11 rounded-lg border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 outline-none transition " +
  "placeholder:text-stone-400 focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 " +
  "aria-[invalid=true]:border-red-400";

export const labelClass = "mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-600";

interface FieldShellProps {
  id: string;
  label: string;
  icon?: LucideIcon;
  hint?: string;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}

export function FieldShell({ id, label, icon: Icon, hint, error, className = "", children }: FieldShellProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass}>
        {Icon && <Icon className="h-3.5 w-3.5 text-stone-400" aria-hidden="true" />}
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-msg`} className="mt-1.5 text-xs text-stone-400">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon?: LucideIcon;
  hint?: string;
  error?: string | null;
};

export default function TextField({ label, value, onChange, icon, hint, error, className, ...rest }: InputProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} icon={icon} hint={hint} error={error} className={className}>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={inputClass}
        {...rest}
      />
    </FieldShell>
  );
}

type TextAreaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string | null;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
};

export function TextArea({ label, value, onChange, hint, error, className, textareaRef, ...rest }: TextAreaProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={`${inputClass} min-h-24 resize-y leading-relaxed`}
        {...rest}
      />
    </FieldShell>
  );
}
