import type { Metadata } from "next";
import { redirect } from "next/navigation";
import App from "@/components/App";
import { AuthShell } from "@/components/auth/AuthForms";
import type { Account } from "@/lib/account";
import type { Crew, Job, ScheduleEvent } from "@/lib/schedule";
import type { Contact } from "@/lib/data";
import { CUSTOMER_SELECT, LEAD_SELECT, customerFromRow, leadFromRow, type CustomerRow, type LeadRow } from "@/lib/rows";
import { serverClient } from "@/lib/supabase/server";

// The signed-in app: same screens as the demo, filled with this business's real leads and people.
// Reads go through Row Level Security, so a person only ever sees their own account.

export const metadata: Metadata = { title: "My Office Bot" };
export const dynamic = "force-dynamic";

export default async function AppPage() {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("account_id, accounts(name, phone, city, timezone, trades, billing_status, sms_status, quick_replies)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) redirect("/onboarding");
  const accountId = membership.account_id as string;

  const [
    { data: leadRows },
    { data: contactRows },
    { data: site },
    { data: customerRows },
    { data: eventRows },
    { data: jobRows },
    { data: crewRows },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select(LEAD_SELECT)
      .eq("account_id", accountId)
      .in("risk_status", ["ok", "released"])
      .order("received_at", { ascending: false })
      .limit(100),
    supabase
      .from("contacts")
      .select("id, name, role_label, phone, email, alert_sms, alert_email, alert_call, consent_status, consent_evidence, phone_opted_out")
      .eq("account_id", accountId)
      .is("removed_at", null)
      .order("created_at"),
    supabase.from("sites").select("domain, public_key, plugin_secret, plugin_last_seen_at, plugin_site_url").eq("account_id", accountId).order("created_at").limit(1).maybeSingle(),
    supabase
      .from("customers")
      .select(CUSTOMER_SELECT)
      .eq("account_id", accountId)
      .order("name")
      .limit(5000),
    supabase.rpc("my_schedule"),
    supabase
      .from("jobs")
      .select("id, lead_id, title, customer_name, phone, email, address, status")
      .eq("account_id", accountId)
      .neq("status", "canceled")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase.from("crews").select("id, name, color, crew_members(contact_id)").eq("account_id", accountId).order("name"),
  ]);

  const now = Date.now();
  const contacts: Contact[] = (contactRows ?? []).map((c) => {
    const agreedFor = (c.consent_evidence as { phone?: string } | null)?.phone;
    const sms: Contact["sms"] = c.phone_opted_out
      ? "opted_out"
      : !c.alert_sms
        ? "off"
        : c.consent_status === "pending"
          ? "pending"
          : c.consent_status === "confirmed" && agreedFor === c.phone
            ? "on"
            : "off";
    return {
      id: c.id,
      name: c.name,
      role: c.role_label ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      channels: { sms: sms === "on" || sms === "pending", email: c.alert_email, call: c.alert_call },
      sms,
    };
  });
  const nameForEmail = (to: unknown) => contacts.find((c) => c.email && c.email === to)?.name ?? String(to ?? "");

  const leads = ((leadRows ?? []) as LeadRow[]).map((l) => leadFromRow(l, nameForEmail, now));

  type AccountRow = {
    name: string;
    phone: string | null;
    city: string | null;
    timezone: string;
    trades: string[];
    billing_status: string;
    sms_status: string;
    quick_replies: string[] | null;
  };
  const customers = ((customerRows ?? []) as CustomerRow[]).map((c) => customerFromRow(c, now));

  type EventRow = {
    id: string;
    job_id: string | null;
    type: ScheduleEvent["type"];
    kind: ScheduleEvent["kind"] | null;
    title: string;
    status: ScheduleEvent["status"];
    day: string;
    from_min: number;
    to_min: number;
    workdays: number;
    skip_weekends: boolean;
    arrive_from_min: number | null;
    arrive_to_min: number | null;
    override_reason: string | null;
    crew_ids: string[];
    person_ids: string[];
  };
  const schedule = {
    events: ((eventRows ?? []) as EventRow[]).map(
      (e): ScheduleEvent => ({
        id: e.id,
        jobId: e.job_id ?? undefined,
        type: e.type,
        kind: e.kind ?? undefined,
        title: e.title,
        status: e.status,
        date: e.day,
        from: e.from_min,
        to: e.to_min,
        workdays: e.workdays,
        skipWeekends: e.skip_weekends,
        arrive: e.arrive_from_min != null && e.arrive_to_min != null ? { from: e.arrive_from_min, to: e.arrive_to_min } : undefined,
        crewIds: e.crew_ids,
        personIds: e.person_ids,
        overrideReason: e.override_reason ?? undefined,
      }),
    ),
    jobs: (jobRows ?? []).map(
      (j): Job => ({
        id: j.id,
        leadId: j.lead_id ?? undefined,
        title: j.title,
        customerName: j.customer_name ?? "",
        phone: j.phone ?? "",
        email: j.email ?? "",
        address: j.address ?? "",
        status: j.status,
      }),
    ),
    crews: ((crewRows ?? []) as { id: string; name: string; color: string; crew_members: { contact_id: string }[] }[]).map(
      (c): Crew => ({ id: c.id, name: c.name, color: c.color, memberIds: c.crew_members.map((m) => m.contact_id) }),
    ),
  };

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
    smsStatus: row?.sms_status ?? "not_configured",
    pluginCode: site?.public_key && site?.plugin_secret ? `MOB1.${site.public_key}.${site.plugin_secret}` : null,
    pluginLastSeen: site?.plugin_last_seen_at ?? null,
    pluginSiteUrl: site?.plugin_site_url ?? null,
    quickReplies: row?.quick_replies ?? null,
  };

  return (
    <App
      account={account}
      initialLeads={leads}
      initialContacts={contacts}
      initialCustomers={customers}
      initialSchedule={schedule}
      variant="app"
    />
  );
}
