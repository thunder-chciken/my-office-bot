"use server";

import { redirect } from "next/navigation";
import { readClaimToken } from "@/lib/server/claimLink";
import { adminDb } from "@/lib/server/db";

// "I'm on it" from an alert email (D64). A button press, never the page load itself, because email
// link scanners open links on their own.
export async function claimFromEmail(form: FormData) {
  const t = String(form.get("t") ?? "");
  const target = readClaimToken(t);
  if (!target) redirect(`/on-it?t=${encodeURIComponent(t)}`);
  const { error } = await adminDb().rpc("claim_lead_from_link", {
    p_lead: target.leadId,
    p_contact: target.contactId,
    p_force: form.get("force") === "1",
  });
  if (error) console.error("claim from email failed", error);
  redirect(`/on-it?t=${encodeURIComponent(t)}${error ? "&error=1" : ""}`);
}
