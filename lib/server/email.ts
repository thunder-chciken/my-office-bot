// Sends email through Resend's HTTP API (no SDK needed).

export type SendResult = { ok: true; id: string } | { ok: false; error: string; retryable: boolean };

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  idempotencyKey: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set", retryable: false };
  const from = `My Office Bot <${process.env.ALERT_FROM_EMAIL ?? "alerts@myofficebot.app"}>`;

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
  const subject = `${lead.urgent ? "URGENT: " : ""}New lead: ${who} — ${service}`;

  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:14px 22px;border-radius:14px;font:600 17px -apple-system,Segoe UI,Arial,sans-serif;text-decoration:none;${
      primary ? "background:#0A6CFF;color:#ffffff" : "background:#E6F0FF;color:#0047B3"
    }">${esc(label)}</a>`;

  const buttons = [
    lead.phone ? button(`tel:${e164(lead.phone)}`, `Call ${first}`, true) : "",
    lead.phone ? button(`sms:${e164(lead.phone)}`, `Text ${first}`, false) : "",
    lead.email ? button(`mailto:${lead.email}`, `Email ${first}`, false) : "",
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
  <p style="margin:0 0 6px;font:600 14px Arial,sans-serif;color:${lead.urgent ? "#E5383B" : "#0A6CFF"};letter-spacing:.04em;text-transform:uppercase">${lead.urgent ? "Urgent lead" : "New lead"}</p>
  <h1 style="margin:0 0 4px;font:800 28px -apple-system,Segoe UI,Arial,sans-serif;color:#0B1A2E">${esc(who)}</h1>
  <p style="margin:0 0 20px;font:600 18px Arial,sans-serif;color:#0A6CFF">${esc(service)}</p>
  ${lead.message ? `<div style="background:#F3F8FF;border:1px solid #E6F0FF;border-radius:16px;padding:16px 18px;margin:0 0 20px;font:17px/1.5 Arial,sans-serif;color:#0B1A2E;white-space:pre-wrap">${esc(lead.message)}</div>` : ""}
  <div style="margin:0 0 16px">${buttons}</div>
  <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px">
    ${row("Phone", lead.phone, lead.phone ? `tel:${e164(lead.phone)}` : undefined)}
    ${row("Email", lead.email, lead.email ? `mailto:${lead.email}` : undefined)}
    ${row("Address", lead.address, lead.address ? `https://maps.google.com/?q=${encodeURIComponent(lead.address)}` : undefined)}
  </table>
  <p style="margin:0;font:14px Arial,sans-serif;color:#7D8A9C">Received ${esc(when)} from ${esc(lead.siteDomain)} · My Office Bot</p>
</td></tr></table></body></html>`;

  const text = [
    `${lead.urgent ? "URGENT " : ""}NEW LEAD: ${who} — ${service}`,
    lead.message ? `\n"${lead.message}"\n` : "",
    lead.phone ? `Phone: ${lead.phone}` : "",
    lead.email ? `Email: ${lead.email}` : "",
    lead.address ? `Address: ${lead.address}` : "",
    `\nReceived ${when} from ${lead.siteDomain}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
