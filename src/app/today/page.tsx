import SignOutButton from "./SignOutButton";

export const metadata = { title: "Today · 1Stayz" };

export default function TodayPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
      <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink">Today</h1>
      <SignOutButton />
    </main>
  );
}
