"use server";

import { cardToken, type CardKind } from "@/lib/server/cardLink";
import { serverClient } from "@/lib/supabase/server";

// Makes a signed contact-card link, but only after checking (under Row Level Security) that the
// signed-in person can see this lead or customer.
export async function contactCardLink(kind: CardKind, id: string): Promise<{ url?: string; error?: string }> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from(kind === "customer" ? "customers" : "leads")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { error: "Couldn't find that contact. Reload and try again." };
  return { url: `/api/v1/vcard?t=${encodeURIComponent(cardToken(kind, id))}` };
}
