import type { NextConfig } from "next";
import { version } from "./package.json";

const nextConfig: NextConfig = {
  env: {
    // Shown in the sidebar footer.
    NEXT_PUBLIC_APP_VERSION: version,
    // Inlined so the browser Supabase client can read them without a NEXT_PUBLIC_ prefix.
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  },
};

export default nextConfig;
