import AppShell from "@/components/layout/AppShell";

// Everything in this group is behind auth: `src/proxy.ts` redirects signed-out
// visitors to /login before these routes render.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
