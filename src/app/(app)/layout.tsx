import AppShell from "@/components/layout/AppShell";
import { getWorkspaceSummary } from "@/lib/church/server";

// Everything in this group is behind auth: `src/proxy.ts` redirects signed-out
// visitors to /login before these routes render.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getWorkspaceSummary();
  return <AppShell workspace={workspace}>{children}</AppShell>;
}
