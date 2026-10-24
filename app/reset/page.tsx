import type { Metadata } from "next";
import { ResetForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Pick a new password — My Office Bot" };

export default function ResetPage() {
  return <ResetForm />;
}
