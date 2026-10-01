import type { Metadata } from "next";
import ChatWidget from "@/components/ChatWidget";
import SignUpForm from "./SignUpForm";

export const metadata: Metadata = {
  title: "Create an account · 1Stayz",
};

export default function SignUpPage() {
  return (
    <>
      <SignUpForm />
      <ChatWidget />
    </>
  );
}
