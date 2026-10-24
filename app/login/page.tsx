import type { Metadata } from "next";
import { SignInForm } from "@/components/auth/AuthForms";
import { safeNext } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Sign in — My Office Bot" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return <SignInForm next={safeNext(next)} linkError={error === "link"} />;
}
