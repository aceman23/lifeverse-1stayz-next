import type { Metadata } from "next";
import { Suspense } from "react";
import ChatWidget from "@/components/ChatWidget";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in · 1Stayz",
};

export default function LoginPage() {
  return (
    <>
      <Suspense>
        <LoginForm />
      </Suspense>
      <ChatWidget />
    </>
  );
}
