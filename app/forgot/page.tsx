import type { Metadata } from "next";
import { ForgotForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Reset your password — My Office Bot" };

export default function ForgotPage() {
  return <ForgotForm />;
}
