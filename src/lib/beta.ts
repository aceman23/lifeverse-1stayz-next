// Pilot signups from /beta. Shared by the public form and Settings › Pilot signups.

/** Columns of the Supabase `beta_signups` table. */
export interface BetaSignup {
  id?: string | number;
  created_at?: string;
  name: string;
  email: string;
  church: string | null;
  role: string | null;
  phone: string | null;
  church_size: string | null;
  notes: string | null;
}

export const CHURCH_SIZES = ["Under 100", "100–250", "250–500", "500–1,000", "1,000–2,500", "2,500+"];
