import type { Metadata } from "next";
import { redirect } from "next/navigation";
import App from "@/components/App";
import { AuthShell } from "@/components/auth/AuthForms";
import type { Account } from "@/lib/account";
import type { Customer } from "@/lib/customers";
import type { AlertEvent, Contact, Lead, LeadStatus } from "@/lib/data";
import { serverClient } from "@/lib/supabase/server";

// The signed-in app: same screens as the demo, filled with this business's real leads and people.
// Reads go through Row Level Security, so a person only ever sees their own account.

export const metadata: Metadata = { title: "My Office Bot" };
export const dynamic = "force-dynamic";

type LeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  service: string | null;
  message: string | null;
  address: string | null;
  urgency: string;
  state: string;
  received_at: string;
  lead_events: { type: string; data: Record<string, unknown> | null; created_at: string }[];
};

const statusFor: Record<string, LeadStatus> = { contacted: "contacted", closed: "booked" };

export default async function AppPage() {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("account_id, accounts(name, phone, city, timezone, trades, billing_status)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) redirect("/onboarding");
  const accountId = membership.account_id as string;

  const [{ data: leadRows }, { data: contactRows }, { data: site }, { data: customerRows }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, name, phone, email, service, message, address, urgency, state, received_at, lead_events(type, data, created_at)")
      .eq("account_id", accountId)
      .in("risk_status", ["ok", "released"])
      .order("received_at", { ascending: false })
      .limit(100),
    supabase
      .from("contacts")
      .select("id, name, role_label, phone, email, alert_sms, alert_email, alert_call")
      .eq("account_id", accountId)
      .is("removed_at", null)
      .order("created_at"),
    supabase.from("sites").select("domain, public_key").eq("account_id", accountId).order("created_at").limit(1).maybeSingle(),
    supabase
      .from("customers")
      .select("id, name, phone, email, address, notes, source, created_at, leads(id)")
      .eq("account_id", accountId)
      .order("name")
      .limit(5000),
  ]);

  const now = Date.now();
  const minutesAgo = (iso: string) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  const contacts: Contact[] = (contactRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role_label ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    channels: { sms: c.alert_sms, email: c.alert_email, call: c.alert_call },
  }));
  const nameForEmail = (to: unknown) => contacts.find((c) => c.email && c.email === to)?.name ?? String(to ?? "");

  const leads: Lead[] = ((leadRows ?? []) as LeadRow[]).map((l) => ({
    id: l.id,
    name: l.name || "Website visitor",
    service: l.service || "Website lead",
    message: l.message || "",
    phone: l.phone ?? "",
    email: l.email ?? "",
    address: l.address ?? "",
    minutesAgo: minutesAgo(l.received_at),
    status: statusFor[l.state] ?? "new",
    source: "Website form",
    urgent: l.urgency === "urgent",
    alerts: [...l.lead_events]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .flatMap((e): AlertEvent[] => {
        const at = minutesAgo(e.created_at);
        if (e.type === "alert_sent") return [{ minutesAgo: at, text: `Emailed ${nameForEmail(e.data?.to)}`, ok: true }];
        if (e.type === "alert_failed") return [{ minutesAgo: at, text: "Email alert didn't go through", ok: false }];
        return [];
      }),
  }));

  type AccountRow = { name: string; phone: string | null; city: string | null; timezone: string; trades: string[]; billing_status: string };
  type CustomerRow = {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    source: "lead" | "manual";
    created_at: string;
    leads: { id: string }[];
  };
  const customers: Customer[] = ((customerRows ?? []) as CustomerRow[]).map((c) => ({
    id: c.id,
    name: c.name || "Website visitor",
    phone: c.phone ?? "",
    email: c.email ?? "",
    address: c.address ?? "",
    notes: c.notes ?? "",
    source: c.source,
    createdMinutesAgo: minutesAgo(c.created_at),
    leadIds: c.leads.map((l) => l.id),
  }));

  const accounts = membership.accounts as unknown as AccountRow | AccountRow[] | null;
  const row = Array.isArray(accounts) ? accounts[0] : accounts;
  if (row?.billing_status === "suspended") {
    return (
      <AuthShell title="Account paused" subtitle="This account is paused, so your forms aren't taking new leads right now.">
        <p className="muted">
          Questions? Email <a href="mailto:support@myofficebot.app">support@myofficebot.app</a>.
        </p>
      </AuthShell>
    );
  }

  const meta = user.user_metadata ?? {};
  const owner = contacts[0];
  const account: Account = {
    live: true,
    name: row?.name ?? "My business",
    phone: row?.phone ?? "",
    city: row?.city ?? "",
    timezone: row?.timezone ?? "America/Chicago",
    trades: row?.trades ?? [],
    website: site?.domain ?? "",
    ownerName: owner?.name ?? String(meta.full_name ?? meta.name ?? ""),
    ownerEmail: user.email ?? "",
    siteKey: site?.public_key ?? null,
  };

  return <App account={account} initialLeads={leads} initialContacts={contacts} initialCustomers={customers} variant="app" />;
}
