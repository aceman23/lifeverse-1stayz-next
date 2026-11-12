"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { updateMyName } from "@/lib/church/actions";

const NAME_MAX = 200;

/** Change the signed-in user's own name, as their church team sees it. */
/** Render it only while open (`{editing && <EditNameDialog … />}`). */
export default function EditNameDialog({ onClose, currentName }: { onClose: () => void; currentName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mounted only while open, so it always starts from the current name.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.select(), 0);
    return () => clearTimeout(t);
  }, []);

  const trimmed = value.replace(/\s+/g, " ").trim();
  const unchanged = trimmed === currentName.trim();

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (saving) return;
    if (!trimmed) return setError("Enter your name.");
    if (unchanged) return onClose();
    setSaving(true);
    const result = await updateMyName(trimmed).catch(() => ({ ok: false as const, error: "Couldn't save your name. Check your connection and try again." }));
    setSaving(false);
    if (!result.ok) return setError(result.error);
    toast("Name updated.");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit your name"
      description="This is how your church team sees you in 1Stayz."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="teal" type="submit" form="edit-name-form" disabled={saving || !trimmed}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form id="edit-name-form" onSubmit={save} noValidate>
        <TextField
          ref={inputRef}
          label="Full name"
          name="full_name"
          autoComplete="name"
          maxLength={NAME_MAX}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          error={error ?? undefined}
        />
      </form>
    </Modal>
  );
}
