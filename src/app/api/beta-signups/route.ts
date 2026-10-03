import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BetaSignup } from "@/lib/beta";

// Pilot signups for Settings › Pilot signups. Runs as the signed-in user with the anon key,
// so the table's RLS policies decide who can read it. No service-role key is involved.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase isn't configured for this environment." }, { status: 503 });
  }

  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Sign in with a staff account to see pilot signups." }, { status: 401 });
  }

  let result = await supabase.from("beta_signups").select("*").order("created_at", { ascending: false }).limit(500);
  // 42703 = undefined column: the table has no created_at, so fall back to the default order.
  if (result.error?.code === "42703") {
    result = await supabase.from("beta_signups").select("*").limit(500);
  }
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ signups: (result.data ?? []) as BetaSignup[] });
}
