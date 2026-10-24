import type { Metadata } from "next";
import { SignUpForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Create your account — My Office Bot" };

export default function SignUpPage() {
  return <SignUpForm />;
}
