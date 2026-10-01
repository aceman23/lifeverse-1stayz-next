import type { Metadata } from "next";
import { Suspense } from "react";
import ConversationsPage from "@/views/ConversationsPage";

export const metadata: Metadata = { title: "Conversations · 1Stayz" };

export default function Page() {
  // The selected thread lives in ?thread=, read with useSearchParams.
  return (
    <Suspense>
      <ConversationsPage />
    </Suspense>
  );
}
