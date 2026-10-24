import { createHmac, timingSafeEqual } from "node:crypto";
import { toE164 } from "@/lib/phone";

// Twilio over its REST API (no SDK). Texts out, plus checking that webhooks really come from Twilio.

export type SmsResult = { ok: true; sid: string } | { ok: false; code?: number; error: string; retryable: boolean };

export const publicBase = () => process.env.PUBLIC_BASE_URL ?? "https://myofficebot.app";

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { ok: false, error: "Twilio is not configured", retryable: false };
  const dest = toE164(to);
  if (!dest) return { ok: false, error: "No valid phone number", retryable: false };

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: dest,
        From: from,
        Body: body,
        StatusCallback: `${publicBase()}/api/twilio/status`,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
    if (res.ok && data.sid) return { ok: true, sid: data.sid };
    return {
      ok: false,
      code: data.code,
      error: `${res.status} ${data.code ?? ""} ${data.message ?? "Twilio error"}`.trim(),
      retryable: res.status >= 500 || res.status === 429,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), retryable: true };
  }
}

/** Twilio error codes that mean "this person opted out", "this number can't get texts" or "not allowed yet". */
export const TWILIO_OPTED_OUT = 21610;

/**
 * Checks X-Twilio-Signature: base64(HMAC-SHA1(auth token, public URL + each POST param name+value, sorted by name)).
 * Uses the public URL (SPEC §11), never the proxied request URL.
 */
export function validTwilioSignature(path: string, params: Record<string, string>, signature: string | null) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const data =
    publicBase() +
    path +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const expected = Buffer.from(createHmac("sha1", token).update(data, "utf8").digest("base64"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function formParams(request: Request) {
  const form = await request.formData();
  const out: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") out[k] = v;
  });
  return out;
}

export const twiml = (message?: string | null) =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${
      message ? `<Message>${message.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</Message>` : ""
    }</Response>`,
    { headers: { "Content-Type": "text/xml" } },
  );

/** The new-lead text. Plain characters keep it to as few billed segments as possible. */
export function leadAlertText(lead: { name: string; service: string; phone: string; message: string; urgent: boolean }) {
  const clean = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const msg = clean(lead.message);
  return [
    `My Office Bot: ${lead.urgent ? "URGENT " : ""}new lead`,
    `${clean(lead.name || "Someone")} - ${clean(lead.service || "New request")}`,
    lead.phone ? clean(lead.phone) : "",
    msg ? `"${msg.length > 110 ? `${msg.slice(0, 107)}...` : msg}"` : "",
    `${publicBase().replace(/^https?:\/\//, "")}/app`,
    "Reply STOP to opt out",
  ]
    .filter(Boolean)
    .join("\n");
}
