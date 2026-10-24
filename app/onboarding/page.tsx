import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { OnboardingForm } from "@/components/auth/OnboardingForm";

export const metadata: Metadata = { title: "Set up your business — My Office Bot" };

export default async function OnboardingPage() {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  const { data: membership } = await supabase.from("memberships").select("account_id").eq("user_id", user.id).maybeSingle();
  if (membership) redirect("/app");

  const meta = user.user_metadata ?? {};
  return <OnboardingForm defaultName={String(meta.full_name ?? meta.name ?? "")} email={user.email ?? ""} />;
}
