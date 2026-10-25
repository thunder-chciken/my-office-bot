import { cardFileName, vcard } from "@/lib/vcard";

// Sends email through Resend's HTTP API (no SDK needed).

export type SendResult = { ok: true; id: string } | { ok: false; error: string; retryable: boolean };

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Shown as the sender's name; the homeowner email goes out under the business's own name (D64). */
  fromName?: string;
  idempotencyKey: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set", retryable: false };
  const name = (opts.fromName ?? "My Office Bot").replace(/[<>"\r\n]/g, "").trim().slice(0, 70) || "My Office Bot";
  const from = `"${name}" <${process.env.ALERT_FROM_EMAIL ?? "alerts@myofficebot.app"}>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // Resend drops a repeat of the same key, so a retry can never send the alert twice.
        "Idempotency-Key": opts.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        ...(opts.attachments?.length
          ? {
              attachments: opts.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                ...(a.contentType ? { content_type: a.contentType } : {}),
              })),
            }
          : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (res.ok && body.id) return { ok: true, id: body.id };
    return { ok: false, error: `${res.status} ${body.message ?? "unknown error"}`, retryable: res.status >= 500 || res.status === 429 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), retryable: true };
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function e164(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return d ? `+${d}` : "";
}

export function leadAlertEmail(lead: {
  name: string;
  phone: string;
  email: string;
  service: string;
  message: string;
  address: string;
  urgent: boolean;
  siteDomain: string;
  receivedAt: Date;
  timezone: string;
  /** Signed "Save contact" link (D55); the same card is also attached to the email. */
  cardUrl?: string;
  /** Signed "I'm on it" link for the person this email goes to (D64). */
  claimUrl?: string;
  /** Set on the second reminder: how long the lead has waited with nobody on it. */
  waitingMinutes?: number;
}) {
  const who = lead.name || "Someone";
  const first = who.split(" ")[0];
  const service = lead.service || "New request";
  const when = lead.receivedAt.toLocaleString("en-US", {
    timeZone: lead.timezone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
  const reminder = lead.waitingMinutes !== undefined;
  const waited = reminder ? waitText(lead.waitingMinutes!) : "";
  const subject = reminder
    ? `Still waiting: ${who} — ${waited}, nobody's on it yet`
    : `${lead.urgent ? "URGENT: " : ""}New lead: ${who} — ${service}`;
  const kicker = reminder ? `Waiting ${waited} · nobody's on it` : lead.urgent ? "Urgent lead" : "New lead";
  const kickerColor = reminder || lead.urgent ? "#E5383B" : "#0A6CFF";

  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:14px 22px;border-radius:14px;font:600 17px -apple-system,Segoe UI,Arial,sans-serif;text-decoration:none;${
      primary ? "background:#0A6CFF;color:#ffffff" : "background:#E6F0FF;color:#0047B3"
    }">${esc(label)}</a>`;

  const buttons = [
    lead.phone ? button(`tel:${e164(lead.phone)}`, `Call ${first}`, true) : "",
    lead.phone ? button(`sms:${e164(lead.phone)}`, `Text ${first}`, false) : "",
    lead.email ? button(`mailto:${lead.email}`, `Email ${first}`, false) : "",
    lead.cardUrl && (lead.phone || lead.email) ? button(lead.cardUrl, "Save contact", false) : "",
  ].join("");

  const row = (label: string, value: string, href?: string) =>
    value
      ? `<tr><td style="padding:6px 0;color:#7D8A9C;font:15px Arial,sans-serif;width:90px">${label}</td><td style="padding:6px 0;font:17px Arial,sans-serif;color:#0B1A2E">${
          href ? `<a href="${esc(href)}" style="color:#0A6CFF;text-decoration:none">${esc(value)}</a>` : esc(value)
        }</td></tr>`
      : "";

  const html = `<!doctype html><html><body style="margin:0;background:#F3F8FF;padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:22px;padding:28px;border:1px solid #E4EAF2">
<tr><td>
  <p style="margin:0 0 6px;font:600 14px Arial,sans-serif;color:${kickerColor};letter-spacing:.04em;text-transform:uppercase">${esc(kicker)}</p>
  <h1 style="margin:0 0 4px;font:800 28px -apple-system,Segoe UI,Arial,sans-serif;color:#0B1A2E">${esc(who)}</h1>
  <p style="margin:0 0 20px;font:600 18px Arial,sans-serif;color:#0A6CFF">${esc(service)}</p>
  ${lead.message ? `<div style="background:#F3F8FF;border:1px solid #E6F0FF;border-radius:16px;padding:16px 18px;margin:0 0 20px;font:17px/1.5 Arial,sans-serif;color:#0B1A2E;white-space:pre-wrap">${esc(lead.message)}</div>` : ""}
  ${
    lead.claimUrl
      ? `<div style="margin:0 0 18px;padding:16px 18px;border-radius:16px;background:#E9F9EF;border:1px solid #C9EFD6">
    <a href="${esc(lead.claimUrl)}" style="display:inline-block;padding:14px 24px;border-radius:14px;background:#17A34A;color:#ffffff;font:700 17px -apple-system,Segoe UI,Arial,sans-serif;text-decoration:none">I'm on it</a>
    <p style="margin:10px 0 0;font:15px Arial,sans-serif;color:#2D5A3D">Taking this one? Tap so your team knows you've got it${reminder ? "" : " and nobody doubles up"}.</p>
  </div>`
      : ""
  }
  <div style="margin:0 0 16px">${buttons}</div>
  <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px">
    ${row("Phone", lead.phone, lead.phone ? `tel:${e164(lead.phone)}` : undefined)}
    ${row("Email", lead.email, lead.email ? `mailto:${lead.email}` : undefined)}
    ${row("Address", lead.address, lead.address ? `https://maps.google.com/?q=${encodeURIComponent(lead.address)}` : undefined)}
  </table>
  ${lead.phone || lead.email ? `<p style="margin:0 0 14px;font:15px Arial,sans-serif;color:#44546B">To save ${esc(first)} to your phone, tap <b>Save contact</b> or the contact card attached to this email.</p>` : ""}
  <p style="margin:0;font:14px Arial,sans-serif;color:#7D8A9C">Received ${esc(when)} from ${esc(lead.siteDomain)} · My Office Bot</p>
</td></tr></table></body></html>`;

  const text = [
    reminder ? `STILL WAITING (${waited}, nobody's on it): ${who} — ${service}` : `${lead.urgent ? "URGENT " : ""}NEW LEAD: ${who} — ${service}`,
    lead.message ? `\n"${lead.message}"\n` : "",
    lead.claimUrl ? `I'm on it (lets your team know you've got it): ${lead.claimUrl}\n` : "",
    lead.phone ? `Phone: ${lead.phone}` : "",
    lead.email ? `Email: ${lead.email}` : "",
    lead.address ? `Address: ${lead.address}` : "",
    lead.cardUrl && (lead.phone || lead.email) ? `\nSave ${first} to your phone: ${lead.cardUrl} (or open the attached contact card)` : "",
    `\nReceived ${when} from ${lead.siteDomain}`,
  ]
    .filter(Boolean)
    .join("\n");

  // The contact card rides along as an attachment: tapping it opens "Add to Contacts" on iPhone and Android.
  const attachments =
    lead.phone || lead.email
      ? [
          {
            filename: cardFileName(who),
            content: Buffer.from(
              vcard({ name: who, phone: lead.phone, email: lead.email, address: lead.address, note: service }),
            ).toString("base64"),
            contentType: "text/vcard",
          },
        ]
      : [];

  return { subject, html, text, attachments };
}

export function waitText(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `${h} hr${h === 1 ? "" : "s"}`;
}

// The instant "we got your request" email to the homeowner (D64), in the business's own words. Plain and
// personal on purpose: it should read like the business wrote it, not like a newsletter.
export function confirmEmail(opts: { subject: string; body: string; business: string; siteDomain: string }) {
  const paragraphs = opts.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;font:17px/1.55 -apple-system,Segoe UI,Arial,sans-serif;color:#0B1A2E">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const footer = `You're getting this because you asked ${opts.business} for help${opts.siteDomain ? ` on ${opts.siteDomain}` : ""}. Just reply to reach them.`;
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;padding:24px 16px">
<div style="max-width:560px;margin:0 auto">
${paragraphs}
<p style="margin:28px 0 0;padding-top:14px;border-top:1px solid #E4EAF2;font:13px/1.5 Arial,sans-serif;color:#7D8A9C">${esc(footer)}</p>
</div></body></html>`;
  const text = `${opts.body}\n\n--\n${footer}`;
  return { subject: opts.subject, html, text };
}
