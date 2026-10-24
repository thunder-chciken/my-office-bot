import { createHash } from "node:crypto";
import { adminDb } from "./db";
import { leadAlertEmail, sendEmail } from "./email";
import { countLinks, emergencyWords, isValidEmail, normalizeLead, phoneDigits } from "./normalize";

// Website form → lead → step-0 email alerts (SPEC §6, §9–§11, decision D37).
// Beta scope: email alerts only; texts/calls and the escalation ladder come next.

export type IntakeResult = {
  status: number;
  body: { ok: boolean; error?: string; lead_id?: string; duplicate?: boolean; alerts_sent?: number };
};

const HONEYPOT_FIELDS = ["website", "_gotcha", "url_check"];
const HOURLY_LEAD_CAP = 30; // per site; beyond this, leads are quarantined (protects the free email quota)

export async function handleFormSubmission(
  siteKey: string,
  raw: Record<string, unknown>,
  meta: { pageUrl: string | null },
): Promise<IntakeResult> {
  const db = adminDb();

  const { data: site, error: siteErr } = await db
    .from("sites")
    .select("id, account_id, domain, accounts(timezone, billing_status)")
    .eq("public_key", siteKey)
    .maybeSingle();
  if (siteErr) throw siteErr;
  if (!site) return { status: 404, body: { ok: false, error: "Unknown form key" } };

  // An admin can pause an account (D52): its forms stop taking leads until it's turned back on.
  const acct = site.accounts as unknown as { billing_status: string } | { billing_status: string }[] | null;
  if ((Array.isArray(acct) ? acct[0] : acct)?.billing_status === "suspended") {
    return { status: 403, body: { ok: false, error: "This form is paused. Please call us instead." } };
  }

  const fields = normalizeLead(raw);
  if (!fields.phone && !fields.email) {
    return { status: 422, body: { ok: false, error: "Please include a phone number or email" } };
  }
  if (fields.email && !isValidEmail(fields.email)) fields.email = "";
  if (!fields.phone && !fields.email) {
    return { status: 422, body: { ok: false, error: "That email address doesn't look right" } };
  }

  // ---- risk (SPEC §11): honeypot → spam; heavy links or flood → quarantined. Nothing is discarded.
  const honeypot = HONEYPOT_FIELDS.some((f) => typeof raw[f] === "string" && (raw[f] as string).trim() !== "");
  const links = countLinks(`${fields.message} ${fields.service}`);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recent } = await db
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("site_id", site.id)
    .gte("received_at", since);

  let riskScore = 0;
  if (honeypot) riskScore += 100;
  if (links >= 2) riskScore += 60;
  if ((recent ?? 0) >= HOURLY_LEAD_CAP) riskScore += 60;
  if (fields.phone && phoneDigits(fields.phone).length < 10) riskScore += 20;
  const riskStatus = honeypot ? "spam" : riskScore >= 60 ? "quarantined" : "ok";
  const urgent = emergencyWords.test(`${fields.service} ${fields.message}`);

  // ---- transport idempotency: the form can send its own id; otherwise the same submission
  // within a 5-minute window (double-clicks, browser retries) maps to the same event id.
  const providedId = typeof raw._event_id === "string" ? raw._event_id.slice(0, 100) : "";
  const windowSlot = Math.floor(Date.now() / (5 * 60 * 1000));
  const eventId =
    providedId ||
    createHash("sha256")
      .update([siteKey, fields.phone, fields.email, fields.message, windowSlot].join("|"))
      .digest("hex");

  const leadRow = {
    account_id: site.account_id,
    site_id: site.id,
    channel: "form",
    external_event_id: eventId,
    ...fields,
    page_url: meta.pageUrl?.slice(0, 500) ?? null,
    risk_score: riskScore,
    risk_status: riskStatus,
    urgency: urgent ? "urgent" : "normal",
    state: riskStatus === "spam" ? "spam" : "received",
  };

  const { data: inserted, error: insErr } = await db
    .from("leads")
    .upsert(leadRow, { onConflict: "site_id,external_event_id", ignoreDuplicates: true })
    .select("id, received_at");
  if (insErr) throw insErr;

  if (!inserted || inserted.length === 0) {
    const { data: existing } = await db
      .from("leads")
      .select("id")
      .eq("site_id", site.id)
      .eq("external_event_id", eventId)
      .maybeSingle();
    return { status: 202, body: { ok: true, lead_id: existing?.id, duplicate: true, alerts_sent: 0 } };
  }

  const lead = inserted[0]!;
  const events: { type: string; data?: Record<string, unknown> }[] = [
    { type: "received", data: { channel: "form", urgent } },
  ];
  if (riskStatus === "quarantined") events.push({ type: "quarantined", data: { risk_score: riskScore } });
  if (riskStatus === "spam") events.push({ type: "marked_spam", data: { reason: "honeypot" } });
  await logEvents(site.account_id, lead.id, events);
  await db.from("sites").update({ last_lead_at: new Date().toISOString() }).eq("id", site.id);

  if (riskStatus !== "ok") return { status: 202, body: { ok: true, lead_id: lead.id, duplicate: false, alerts_sent: 0 } };

  // Save the homeowner as a customer (matched by phone or email, D53). Never blocks the alert.
  const { error: custErr } = await db.rpc("link_lead_customer", { p_lead: lead.id });
  if (custErr) console.error("customer link failed", custErr);

  // ---- step 0: email every contact who wants email alerts (D37: dispatched right at intake)
  const { data: contacts, error: cErr } = await db
    .from("contacts")
    .select("id, email")
    .eq("account_id", site.account_id)
    .eq("alert_email", true)
    .is("removed_at", null)
    .not("email", "is", null);
  if (cErr) throw cErr;

  const accounts = site.accounts as unknown as { timezone: string } | { timezone: string }[] | null;
  const timezone = (Array.isArray(accounts) ? accounts[0]?.timezone : accounts?.timezone) ?? "America/Chicago";
  const message = leadAlertEmail({
    ...fields,
    urgent,
    siteDomain: site.domain,
    receivedAt: new Date(lead.received_at),
    timezone,
  });

  let sent = 0;
  for (const contact of contacts ?? []) {
    const idempotencyKey = `${lead.id}:0:${contact.id}:email`;
    const { data: attempt, error: aErr } = await db
      .from("notification_attempts")
      .insert({
        account_id: site.account_id,
        lead_id: lead.id,
        contact_id: contact.id,
        channel: "email",
        step: 0,
        status: "dispatching",
        attempt_count: 1,
        idempotency_key: idempotencyKey,
        to_address: contact.email,
      })
      .select("id")
      .single();
    if (aErr) {
      // Unique violation = this alert was already dispatched by an earlier request.
      if (aErr.code === "23505") continue;
      throw aErr;
    }

    const result = await sendEmail({
      to: contact.email!,
      ...message,
      replyTo: fields.email || undefined,
      idempotencyKey,
    });
    const now = new Date().toISOString();
    if (result.ok) {
      sent++;
      await db
        .from("notification_attempts")
        .update({ status: "sent", provider_sid: result.id, updated_at: now })
        .eq("id", attempt.id);
      await logEvents(site.account_id, lead.id, [{ type: "alert_sent", data: { channel: "email", to: contact.email } }]);
    } else {
      // Retryable failures stay visible as "uncertain" for the reconciler (Milestone 2).
      await db
        .from("notification_attempts")
        .update({ status: result.retryable ? "uncertain" : "failed", error: result.error, updated_at: now })
        .eq("id", attempt.id);
      await logEvents(site.account_id, lead.id, [{ type: "alert_failed", data: { channel: "email", error: result.error } }]);
    }
  }

  if (sent > 0) await db.from("leads").update({ state: "notified" }).eq("id", lead.id).eq("state", "received");

  return { status: 202, body: { ok: true, lead_id: lead.id, duplicate: false, alerts_sent: sent } };
}

async function logEvents(accountId: string, leadId: string, events: { type: string; data?: Record<string, unknown> }[]) {
  const { error } = await adminDb()
    .from("lead_events")
    .insert(events.map((e) => ({ account_id: accountId, lead_id: leadId, type: e.type, actor: "system", data: e.data ?? {} })));
  if (error) throw error;
}
