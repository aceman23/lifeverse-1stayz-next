"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const inputClass =
  "w-full h-14 px-4 rounded-12 text-sm text-ink bg-surface border border-line outline-none transition " +
  "placeholder:text-ink-3 focus:border-teal focus:shadow-[0_0_0_3px_rgba(1,132,119,.12)]";
const invalidClass = "border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(200,16,46,.12)]";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  /** Rendered inside the input's right edge, e.g. a show/hide password button. */
  trailing?: ReactNode;
};

/** Labelled input that wires its error or hint to `aria-describedby`. */
const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, trailing, id, className, "aria-invalid": ariaInvalid, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-${error ? "error" : "hint"}`;
  const message = error ?? hint;
  // An explicit aria-invalid also counts, for fields that show their error outside the component.
  const invalid = Boolean(error) || ariaInvalid === true || ariaInvalid === "true";

  const input = (
    <input
      ref={ref}
      id={inputId}
      aria-invalid={invalid}
      aria-describedby={message ? messageId : undefined}
      className={cn(inputClass, trailing && "pr-12", invalid && invalidClass, className)}
      {...props}
    />
  );

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {trailing ? (
        <div className="relative">
          {input}
          {trailing}
        </div>
      ) : (
        input
      )}
      {message && (
        <p id={messageId} className={cn("mt-1.5 text-xs", error ? "text-danger" : "text-ink-3")}>
          {message}
        </p>
      )}
    </div>
  );
});

TextField.displayName = "TextField";

export default TextField;
