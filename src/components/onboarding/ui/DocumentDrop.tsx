"use client";

import { useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import type { UploadedDocument } from "@/lib/onboarding/types";

interface DocumentDropProps {
  documents: UploadedDocument[];
  accept: string[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
}

const extensionOf = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();

/** Drag-and-drop file picker. Only file names and types are kept; nothing is uploaded. */
export default function DocumentDrop({ documents, accept, onAdd, onRemove }: DocumentDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    const ok = files.filter((f) => accept.includes(extensionOf(f.name)));
    setRejected(files.filter((f) => !ok.includes(f)).map((f) => f.name));
    if (ok.length) onAdd(ok);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed transition-colors ${
          dragging ? "border-[#10B981] bg-emerald-50" : "border-stone-200 bg-stone-50/50"
        }`}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-xl px-4 py-8 text-center"
        >
          <Upload className="h-6 w-6 text-stone-400" aria-hidden="true" />
          <span className="text-sm font-medium text-stone-700">Drop files here or click to browse</span>
          <span className="text-xs text-stone-400">PDF, DOCX, TXT, Markdown</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {rejected.length > 0 && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          Not a supported file type: {rejected.join(", ")}
        </p>
      )}

      {documents.length > 0 && (
        <ul className="mt-3 space-y-2">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 rounded-lg border border-stone-200 py-1 pr-1 pl-3">
              <FileText className="h-4 w-4 shrink-0 text-stone-400" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-stone-900">{doc.name}</span>
              <span className="text-[10px] font-semibold text-stone-400 uppercase">{doc.type}</span>
              <button
                type="button"
                onClick={() => onRemove(doc.id)}
                aria-label={`Remove ${doc.name}`}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-50 hover:text-red-600"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
