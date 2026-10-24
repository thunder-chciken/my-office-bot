import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { serverClient } from "@/lib/supabase/server";
import { adminDb } from "./db";

// Platform admin (D52). Only people listed in private.platform_admins get in; everyone else sees a
// plain 404 so the page doesn't advertise itself. Data loads with the secret key, so every entry
// point must call requireAdmin() first.

export async function requireAdmin(): Promise<User> {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: isAdmin } = await supabase.rpc("am_i_admin");
  if (isAdmin !== true) notFound();
  return user;
}

export async function audit(actor: User, action: string, target: string, details: Record<string, unknown> = {}) {
  const { error } = await adminDb()
    .from("admin_audit")
    .insert({ actor_user_id: actor.id, actor_email: actor.email, action, target, details });
  if (error) console.error("admin audit failed", error);
}

export type AdminBusiness = {
  id: string;
  name: string;
  createdAt: string;
  status: string;
  smsStatus: string;
  city: string | null;
  domain: string | null;
  owners: { userId: string; email: string }[];
  people: number;
  leadsTotal: number;
  leads7d: number;
  lastLeadAt: string | null;
  /** Businesses that signed up through this one's "Powered by My Office Bot" link (D59). */
  referrals: number;
};

export type AdminPerson = {
  id: string;
  email: string;
  name: string;
  provider: string;
  confirmed: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  businesses: { id: string; name: string; role: string; soleMember: boolean }[];
};

export type AdminProblem = { id: string; business: string; to: string; status: string; error: string | null; at: string };
export type AdminAudit = { id: number; actor: string; action: string; target: string; at: string };

export type AdminData = {
  businesses: AdminBusiness[];
  people: AdminPerson[];
  problems: AdminProblem[];
  audit: AdminAudit[];
  stats: { businesses: number; people: number; leads7d: number; failed7d: number };
};

export async function loadAdminData(): Promise<AdminData> {
  const db = adminDb();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [accounts, memberships, sites, contacts, leads, problems, auditRows, users] = await Promise.all([
    db.from("accounts").select("id, name, created_at, billing_status, sms_status, city, referred_by_site").order("created_at", { ascending: false }),
    db.from("memberships").select("account_id, user_id, role"),
    db.from("sites").select("account_id, domain, public_key"),
    db.from("contacts").select("account_id").is("removed_at", null),
    db.from("leads").select("account_id, received_at").order("received_at", { ascending: false }).limit(20000),
    db
      .from("notification_attempts")
      .select("id, account_id, to_address, status, error, created_at")
      .in("status", ["failed", "uncertain"])
      .order("created_at", { ascending: false })
      .limit(25),
    db.from("admin_audit").select("id, actor_email, action, target, created_at").order("created_at", { ascending: false }).limit(25),
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  for (const r of [accounts, memberships, sites, contacts, leads, problems, auditRows]) if (r.error) throw r.error;
  if (users.error) throw users.error;

  const userList = users.data.users;
  const emailOf = (id: string) => userList.find((u) => u.id === id)?.email ?? "(deleted user)";
  const nameOf = new Map((accounts.data ?? []).map((a) => [a.id as string, a.name as string]));
  const members = memberships.data ?? [];
  const leadRows = leads.data ?? [];

  const businesses: AdminBusiness[] = (accounts.data ?? []).map((a) => {
    const mine = leadRows.filter((l) => l.account_id === a.id);
    const keys = (sites.data ?? []).filter((s) => s.account_id === a.id).map((s) => s.public_key as string);
    return {
      id: a.id,
      name: a.name,
      createdAt: a.created_at,
      status: a.billing_status,
      smsStatus: a.sms_status,
      city: a.city,
      domain: (sites.data ?? []).find((s) => s.account_id === a.id)?.domain || null,
      owners: members.filter((m) => m.account_id === a.id).map((m) => ({ userId: m.user_id, email: emailOf(m.user_id) })),
      people: (contacts.data ?? []).filter((c) => c.account_id === a.id).length,
      leadsTotal: mine.length,
      leads7d: mine.filter((l) => l.received_at >= weekAgo).length,
      lastLeadAt: mine[0]?.received_at ?? null,
      referrals: (accounts.data ?? []).filter((x) => x.referred_by_site && keys.includes(x.referred_by_site)).length,
    };
  });

  const people: AdminPerson[] = userList
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      name: String(u.user_metadata?.full_name ?? u.user_metadata?.name ?? ""),
      provider: (u.app_metadata?.providers as string[] | undefined)?.join(", ") ?? String(u.app_metadata?.provider ?? "email"),
      confirmed: !!(u.email_confirmed_at ?? u.confirmed_at),
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      businesses: members
        .filter((m) => m.user_id === u.id)
        .map((m) => ({
          id: m.account_id,
          name: nameOf.get(m.account_id) ?? "(deleted)",
          role: m.role,
          soleMember: members.filter((x) => x.account_id === m.account_id).length === 1,
        })),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const problemList: AdminProblem[] = (problems.data ?? []).map((p) => ({
    id: p.id,
    business: nameOf.get(p.account_id) ?? "(deleted)",
    to: p.to_address ?? "",
    status: p.status,
    error: p.error,
    at: p.created_at,
  }));

  return {
    businesses,
    people,
    problems: problemList,
    audit: (auditRows.data ?? []).map((r) => ({ id: r.id, actor: r.actor_email ?? "", action: r.action, target: r.target, at: r.created_at })),
    stats: {
      businesses: businesses.length,
      people: people.length,
      leads7d: leadRows.filter((l) => l.received_at >= weekAgo).length,
      failed7d: problemList.filter((p) => p.at >= weekAgo).length,
    },
  };
}
