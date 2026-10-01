"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DEMO_COOKIE } from "@/lib/demo";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    try {
      await createClient().auth.signOut();
    } catch {
      // Supabase env vars missing; only the demo cookie needed clearing.
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="text-sm font-medium text-ink-2 underline underline-offset-4 hover:text-ink"
    >
      Sign out
    </button>
  );
}
