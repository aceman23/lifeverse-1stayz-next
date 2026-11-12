"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

/** Right-side panel from md up; a full-screen sheet below. Native <dialog> like Modal. */
export default function Drawer({ open, onClose, title, description, footer, children }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="animate-fade-in fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-surface p-0 text-ink backdrop:bg-black/40 backdrop:backdrop-blur-sm open:flex open:flex-col md:left-auto md:w-[480px] md:border-l md:border-line md:shadow-pop"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-m-1 rounded-md p-1.5 text-ink-3 transition-colors hover:bg-bg hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line bg-bg/60 px-5 py-3">{footer}</div>}
    </dialog>
  );
}
