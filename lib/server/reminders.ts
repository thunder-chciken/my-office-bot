import { adminDb } from "./db";
import { cardToken } from "./cardLink";
import { claimUrl } from "./claimLink";
import { leadAlertEmail, sendEmail, waitText } from "./email";
import { pushToAccount, reminderPush } from "./push";

// "No lead left waiting" (D64): the second reminder. The database checks every minute (pg_cron, 0014) for leads
// nobody has claimed or replied to after the business's reminder time, and calls /api/cron/reminders with their ids.
// Taking a lead marks it reminded in the same step, so each lead gets one reminder however often this runs.

let token: string | null = null;

/** The secret the database sends with each call. Made by the database itself, so no key is copied anywhere. */
export async function reminderTokenMatches(given: string) {
  if (!token) {
    const { data, error } = await adminDb().rpc("reminder_token");
    if (error) throw error;
    token = (data as string | null) ?? null;
  }
  return !!token && given.length === token.length && given === token;
}

type DueLead = {
  id: string;
  account_id: string;
  site_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  service: string | null;
  message: string | null;
  urgency: string;
  received_at: string;
};

export async function sendReminders(ids: string[]) {
  const db = adminDb();
  const { data, error } = await db.rpc("take_due_reminders", { p_ids: ids });
  if (error) throw error;
  const due = (data ?? []) as DueLead[];
  let pushes = 0;
  let emails = 0;

  for (const lead of due) {
    const waitedMin = Math.max(1, Math.round((Date.now() - new Date(lead.received_at).getTime()) / 60000));
    const waited = waitText(waitedMin);
    const fields = {
      name: lead.name ?? "",
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      service: lead.service ?? "",
      message: lead.message ?? "",
    };

    let pushed = 0;
    try {
      pushed = (await pushToAccount(lead.account_id, reminderPush({ id: lead.id, ...fields }, waited))).sent;
    } catch (e) {
      console.error("reminder push failed", e);
    }

    const [{ data: contacts }, { data: site }] = await Promise.all([
      db
        .from("contacts")
        .select("id, email")
        .eq("account_id", lead.account_id)
        .eq("alert_email", true)
        .is("removed_at", null)
        .not("email", "is", null)
        .order("created_at"),
      db.from("sites").select("domain, accounts(timezone)").eq("id", lead.site_id).maybeSingle(),
    ]);
    const acct = site?.accounts as unknown as { timezone: string } | { timezone: string }[] | null;
    const timezone = (Array.isArray(acct) ? acct[0]?.timezone : acct?.timezone) ?? "America/Chicago";

    let mailed = 0;
    for (const contact of contacts ?? []) {
      const { attachments: _card, ...message } = leadAlertEmail({
        ...fields,
        address: "",
        urgent: lead.urgency === "urgent",
        siteDomain: site?.domain ?? "",
        receivedAt: new Date(lead.received_at),
        timezone,
        cardUrl: `${process.env.PUBLIC_BASE_URL ?? "https://myofficebot.app"}/api/v1/vcard?t=${encodeURIComponent(cardToken("lead", lead.id))}`,
        claimUrl: claimUrl(lead.id, contact.id),
        waitingMinutes: waitedMin,
      });
      const result = await sendEmail({
        to: contact.email!,
        ...message,
        replyTo: fields.email || undefined,
        idempotencyKey: `${lead.id}:reminder:${contact.id}`,
      });
      if (result.ok) mailed++;
      else console.error("reminder email failed", result.error);
    }

    pushes += pushed;
    emails += mailed;
    await db.from("lead_events").insert({
      account_id: lead.account_id,
      lead_id: lead.id,
      type: "reminder_sent",
      actor: "system",
      data: { minutes: waitedMin, devices: pushed, emails: mailed },
    });
  }

  return { reminded: due.length, pushes, emails };
}
