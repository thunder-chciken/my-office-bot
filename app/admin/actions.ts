"use server";

import { revalidatePath } from "next/cache";
import { audit, requireAdmin } from "@/lib/server/admin";
import { adminDb } from "@/lib/server/db";
import { sendDailyDigests } from "@/lib/server/digest";
import { sendSms } from "@/lib/server/twilio";
import { inviteText } from "@/lib/consent";

// Admin actions (D52). Each one re-checks that the caller is an admin, and the destructive ones
// re-check the typed confirmation on the server, so a stray click or a forged request can't delete anything.

type Result = { error?: string };

export async function setBusinessPaused(accountId: string, paused: boolean): Promise<Result> {
  const actor = await requireAdmin();
  const { data, error } = await adminDb()
    .from("accounts")
    .update({ billing_status: paused ? "suspended" : "trialing" })
    .eq("id", accountId)
    .select("name")
    .maybeSingle();
  if (error || !data) return { error: "Couldn't find that business." };
  await audit(actor, paused ? "pause_business" : "resume_business", data.name, { account_id: accountId });
  revalidatePath("/admin");
  return {};
}

// Texts on/off for a business (D56). Turn on once its carrier registration is approved; turning on also
// sends the YES-confirmation text to anyone who was added while texts were waiting.
export async function setBusinessTexts(accountId: string, on: boolean): Promise<Result & { summary?: string }> {
  const actor = await requireAdmin();
  const db = adminDb();
  const { data, error } = await db
    .from("accounts")
    .update({ sms_status: on ? "active" : "not_configured" })
    .eq("id", accountId)
    .select("name")
    .maybeSingle();
  if (error || !data) return { error: "Couldn't find that business." };

  let invited = 0;
  if (on) {
    const [{ data: pending }, { data: owner }] = await Promise.all([
      db.from("contacts").select("phone").eq("account_id", accountId).eq("alert_sms", true).eq("consent_status", "pending")
        .eq("phone_opted_out", false).is("removed_at", null).not("phone", "is", null),
      db.from("contacts").select("name").eq("account_id", accountId).eq("role_label", "Owner").limit(1).maybeSingle(),
    ]);
    const ownerFirst = (owner?.name ?? "Your boss").split(" ")[0]!;
    for (const p of pending ?? []) if ((await sendSms(p.phone!, inviteText(ownerFirst, data.name))).ok) invited++;
  }
  await audit(actor, on ? "texts_on" : "texts_off", data.name, { account_id: accountId, invited });
  revalidatePath("/admin");
  return { summary: on ? `Texts are on for ${data.name}.${invited ? ` Sent ${invited} confirmation text${invited > 1 ? "s" : ""}.` : ""}` : `Texts are off for ${data.name}.` };
}

export async function deleteBusiness(accountId: string, typedName: string): Promise<Result> {
  const actor = await requireAdmin();
  const db = adminDb();
  const { data: account } = await db.from("accounts").select("name").eq("id", accountId).maybeSingle();
  if (!account) return { error: "Couldn't find that business." };
  if (typedName.trim() !== account.name.trim()) return { error: "The name you typed doesn't match." };

  // Cascades to its people, sites, leads, alerts and schedule. Sign-ins stay; they'll be asked to set up a business again.
  const { error } = await db.from("accounts").delete().eq("id", accountId);
  if (error) return { error: "Couldn't delete it. Nothing was changed." };
  await audit(actor, "delete_business", account.name, { account_id: accountId });
  revalidatePath("/admin");
  return {};
}

// Sends tomorrow's crew emails right away (the same run the evening cron does). Safe to repeat.
export async function sendCrewEmailsNow(): Promise<Result & { summary?: string }> {
  const actor = await requireAdmin();
  try {
    const r = await sendDailyDigests();
    await audit(actor, "send_crew_emails", r.date ?? "tomorrow", r);
    const summary =
      r.people === 0
        ? "Nobody has anything booked tomorrow, so no emails went out."
        : `Tomorrow's schedule: ${r.sent} sent, ${r.skipped} already sent earlier${r.failed ? `, ${r.failed} failed` : ""}.`;
    revalidatePath("/admin");
    return { summary };
  } catch {
    return { error: "Couldn't send the crew emails. Nothing was sent twice." };
  }
}

export async function deletePerson(userId: string, typedEmail: string, alsoBusinesses: boolean): Promise<Result> {
  const actor = await requireAdmin();
  if (userId === actor.id) return { error: "You can't delete your own admin account here." };
  const db = adminDb();

  const { data: found, error: findErr } = await db.auth.admin.getUserById(userId);
  if (findErr || !found.user) return { error: "Couldn't find that person." };
  const email = found.user.email ?? "";
  if (!email || typedEmail.trim().toLowerCase() !== email.toLowerCase()) return { error: "The email you typed doesn't match." };

  // Businesses where they're the only member go too, if asked. Shared businesses are never deleted here.
  const deleted: string[] = [];
  if (alsoBusinesses) {
    const { data: mine } = await db.from("memberships").select("account_id").eq("user_id", userId);
    for (const m of mine ?? []) {
      const { count } = await db.from("memberships").select("user_id", { count: "exact", head: true }).eq("account_id", m.account_id);
      if (count === 1) {
        const { data: acct } = await db.from("accounts").delete().eq("id", m.account_id).select("name").maybeSingle();
        if (acct) deleted.push(acct.name);
      }
    }
  }

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return { error: `Couldn't delete the sign-in${deleted.length ? " (their business was already deleted)" : ""}.` };
  await audit(actor, "delete_person", email, { user_id: userId, deleted_businesses: deleted });
  revalidatePath("/admin");
  return {};
}
