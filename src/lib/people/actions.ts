"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/church/types";
import { getChurchSession, isDemoRequest } from "@/lib/church/server";
import { MAX_NOTE, PIPELINE_STAGES, isUuid, type GuestPatch } from "./types";
import { logError } from "@/lib/log";

// Guest writes from the person page. The church comes from the session and every write is
// also filtered by it; RLS checks membership again. Values are never logged.

const DEMO_ERROR = "This is the demo workspace, so changes aren't saved.";
const SIGNED_OUT_ERROR = "Your session has ended. Sign in again to save.";

function logFailure(event: string, message: string) {
  logError(event, { message });
}

/** Adds a staff note to "What we know". Sensitive notes (care, prayer, crisis) are tagged C3. */
export async function addPersonNote(personId: string, value: string, sensitive: boolean): Promise<ActionResult> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };
  const note = value.trim();
  if (!isUuid(personId)) return { ok: false, error: "That guest wasn't found." };
  if (!note) return { ok: false, error: "Write a note first." };
  if (note.length > MAX_NOTE) return { ok: false, error: `Keep notes to ${MAX_NOTE.toLocaleString()} characters or fewer.` };

  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };

  // actor defaults to auth.uid() in the database, and RLS requires it to be the signed-in user.
  const { error } = await session.supabase.from("church_person_facts").insert({
    church_id: session.churchId,
    person_id: personId,
    field: "note",
    value: note,
    data_class: sensitive ? "C3" : "C2",
    source: "staff",
  });

  if (error) {
    logFailure("people.note_save_error", error.message);
    return { ok: false, error: "Couldn't save the note. Try again." };
  }
  revalidatePath(`/people/${personId}`);
  return { ok: true, data: undefined };
}

/** Changes stage, follow-up owner, "Don't contact" or the identity-review flag. */
export async function updatePerson(personId: string, patch: GuestPatch): Promise<ActionResult> {
  if (await isDemoRequest()) return { ok: false, error: DEMO_ERROR };
  if (!isUuid(personId)) return { ok: false, error: "That guest wasn't found." };

  const row: Record<string, unknown> = {};
  if (patch.stage !== undefined) {
    if (!PIPELINE_STAGES.includes(patch.stage)) return { ok: false, error: "Choose a stage from the list." };
    row.stage = patch.stage;
  }
  if (patch.ownerClientId !== undefined) {
    if (patch.ownerClientId !== null && (typeof patch.ownerClientId !== "string" || patch.ownerClientId.length > 100)) {
      return { ok: false, error: "Choose someone from your team." };
    }
    row.owner_staff_client_id = patch.ownerClientId;
  }
  if (patch.doNotContact !== undefined) row.do_not_contact = Boolean(patch.doNotContact);
  // Staff can clear a review, never raise one by hand here (intake does that).
  if (patch.needsReview !== undefined) {
    if (patch.needsReview) return { ok: false, error: "Identity reviews are opened by intake." };
    row.needs_review = false;
  }
  if (Object.keys(row).length === 0) return { ok: true, data: undefined };

  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };

  if (typeof row.owner_staff_client_id === "string") {
    const { data: staff } = await session.supabase
      .from("church_staff")
      .select("client_id")
      .eq("church_id", session.churchId)
      .eq("client_id", row.owner_staff_client_id)
      .maybeSingle();
    if (!staff) return { ok: false, error: "Choose someone from your team." };
  }

  const { data, error } = await session.supabase
    .from("church_people")
    .update(row)
    .eq("church_id", session.churchId)
    .eq("id", personId)
    .select("id");

  if (error || !data?.length) {
    logFailure("people.update_error", error?.message ?? "no row updated");
    return { ok: false, error: "Couldn't save the change. Try again." };
  }
  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  return { ok: true, data: undefined };
}
