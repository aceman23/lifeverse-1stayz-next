import type { NextConfig } from "next";
import { version } from "./package.json";

const nextConfig: NextConfig = {
  // Shown in the sidebar footer.
  env: { NEXT_PUBLIC_APP_VERSION: version },
};

export default nextConfig;
