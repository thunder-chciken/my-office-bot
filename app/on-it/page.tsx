import type { Metadata } from "next";
import { Hand, MessageSquare, Phone } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthForms";
import { readClaimToken } from "@/lib/server/claimLink";
import { adminDb } from "@/lib/server/db";
import { claimFromEmail } from "./actions";

// Opened from the "I'm on it" button in an alert email (D64), often on a phone that isn't signed in.
// Shows the lead and who has it; claiming takes one more tap (see actions.ts for why).

export const metadata: Metadata = { title: "I'm on it — My Office Bot", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const dial = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `+1${d}` : d ? `+${d}` : "";
};

export default async function OnItPage({ searchParams }: { searchParams: Promise<{ t?: string; error?: string }> }) {
  const { t = "", error } = await searchParams;
  const target = readClaimToken(t);
  if (!target) {
    return (
      <AuthShell title="This link has expired" subtitle="Open the lead in My Office Bot to see who's on it.">
        <a className="btn btn-primary btn-block btn-xl" href="/app">
          Open My Office Bot
        </a>
      </AuthShell>
    );
  }

  const db = adminDb();
  const [{ data: lead }, { data: me }] = await Promise.all([
    db
      .from("leads")
      .select("id, name, phone, service, state, acknowledged_at, acknowledged_by_name, acknowledged_by_contact_id, accounts(timezone)")
      .eq("id", target.leadId)
      .maybeSingle(),
    db.from("contacts").select("name").eq("id", target.contactId).maybeSingle(),
  ]);
  if (!lead || !me) {
    return (
      <AuthShell title="Lead not found" subtitle="It may have been removed.">
        <a className="btn btn-primary btn-block btn-xl" href="/app">
          Open My Office Bot
        </a>
      </AuthShell>
    );
  }

  const acct = lead.accounts as unknown as { timezone: string } | { timezone: string }[] | null;
  const timezone = (Array.isArray(acct) ? acct[0]?.timezone : acct?.timezone) ?? "America/Chicago";
  const who = lead.name || "This lead";
  const first = who.split(" ")[0];
  const mine = lead.acknowledged_at && lead.acknowledged_by_contact_id === target.contactId;
  const theirs = lead.acknowledged_at && !mine;
  const since = lead.acknowledged_at
    ? new Date(lead.acknowledged_at).toLocaleTimeString("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" })
    : "";
  const done = lead.state === "contacted" || lead.state === "closed";

  const title = mine ? `You're on it, ${me.name.split(" ")[0]}` : theirs ? `${lead.acknowledged_by_name ?? "Someone"} is on it` : who;
  const subtitle = mine
    ? `Your team can see you have ${first} (since ${since}).`
    : theirs
      ? `${lead.acknowledged_by_name ?? "Someone"} took ${first} at ${since}.`
      : [lead.service, done ? "already replied to" : "nobody's on it yet"].filter(Boolean).join(" · ");

  return (
    <AuthShell title={title} subtitle={subtitle}>
      {error && <p className="auth-error">Couldn&apos;t save that. Try again.</p>}
      {!mine && (
        <form action={claimFromEmail} className="form">
          <input type="hidden" name="t" value={t} />
          {theirs && <input type="hidden" name="force" value="1" />}
          <button className={`btn btn-block btn-xl ${theirs ? "btn-soft" : "btn-claim"}`}>
            <Hand size={24} strokeWidth={2.4} /> {theirs ? "Take it over" : "I'm on it"}
          </button>
        </form>
      )}
      {lead.phone && (
        <div className="btn-row on-it-actions">
          <a className="btn btn-primary" href={`tel:${dial(lead.phone)}`}>
            <Phone size={22} strokeWidth={2.5} /> Call {first}
          </a>
          <a className="btn btn-soft" href={`sms:${dial(lead.phone)}`}>
            <MessageSquare size={22} strokeWidth={2.5} /> Text
          </a>
        </div>
      )}
      <p className="auth-links">
        <a href={`/app?lead=${lead.id}`}>Open the lead in My Office Bot</a>
      </p>
    </AuthShell>
  );
}
