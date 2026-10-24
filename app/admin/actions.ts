"use server";

import { revalidatePath } from "next/cache";
import { audit, requireAdmin } from "@/lib/server/admin";
import { adminDb } from "@/lib/server/db";

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
