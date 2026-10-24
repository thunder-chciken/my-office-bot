import { adminDb } from "./db";
import { sendEmail } from "./email";
import { toE164 } from "@/lib/phone";

// Evening-before crew email (D54). Once a day, each person with something booked tomorrow gets one
// email listing their stops. The ledger (schedule_notifications) makes a re-run send nothing twice.

type Row = {
  contact_id: string;
  contact_name: string;
  email: string;
  event_id: string;
  type: "appointment" | "work_block" | "unavailable";
  kind: "estimate" | "inspection" | "service" | null;
  title: string;
  from_min: number;
  to_min: number;
  day_number: number;
  day_count: number;
  arrive_from_min: number | null;
  arrive_to_min: number | null;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
};

export type DigestReport = { accounts: number; people: number; sent: number; skipped: number; failed: number; date?: string };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function time(min: number) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

const kindLabel = { estimate: "Estimate", inspection: "Inspection", service: "Service call" } as const;

/** "Tomorrow" in a time zone, as YYYY-MM-DD. */
export function tomorrowIn(timezone: string, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function digestEmail(businessName: string, name: string, dateKey: string, rows: Row[]) {
  const dayText = new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const first = name.split(" ")[0] || name;
  const items = rows.map((r) => {
    const what =
      r.type === "work_block"
        ? `${r.title}${r.day_count > 1 ? ` (day ${r.day_number} of ${r.day_count})` : ""}`
        : r.type === "unavailable"
          ? `Time off: ${r.title}`
          : `${r.kind ? kindLabel[r.kind] : r.title}`;
    const when = r.type === "unavailable" && r.from_min === 0 && r.to_min >= 1440 ? "All day" : `${time(r.from_min)}–${time(r.to_min)}`;
    const arrive = r.arrive_from_min != null && r.arrive_to_min != null ? `Homeowner told: arrive ${time(r.arrive_from_min)}–${time(r.arrive_to_min)}` : "";
    return { what, when, arrive, customer: r.customer_name ?? "", phone: r.phone ?? "", address: r.address ?? "" };
  });

  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0B1A2E">
<p style="font-size:18px;font-weight:700;margin:0 0 18px">My <span style="color:#0A6CFF">Office</span> Bot</p>
<h1 style="font-size:24px;margin:0 0 6px">Tomorrow: ${esc(dayText)}</h1>
<p style="font-size:16px;color:#44546B;margin:0 0 20px">Hi ${esc(first)}, here's your schedule for ${esc(businessName)}.</p>
${items
  .map(
    (i) => `<div style="border:1px solid #E4EAF2;border-left:5px solid #0A6CFF;border-radius:14px;padding:14px 16px;margin:0 0 12px">
<p style="margin:0;font-size:15px;font-weight:700;color:#0A6CFF">${esc(i.when)}</p>
<p style="margin:4px 0 0;font-size:18px;font-weight:700">${esc(i.customer ? `${i.customer} — ${i.what}` : i.what)}</p>
${i.address ? `<p style="margin:6px 0 0;font-size:15px"><a href="https://www.google.com/maps/dir/?api=1&amp;destination=${encodeURIComponent(i.address)}" style="color:#0047B3">${esc(i.address)}</a></p>` : ""}
${i.phone ? `<p style="margin:4px 0 0;font-size:15px"><a href="tel:${toE164(i.phone)}" style="color:#0047B3">${esc(i.phone)}</a></p>` : ""}
${i.arrive ? `<p style="margin:6px 0 0;font-size:14px;color:#44546B">${esc(i.arrive)}</p>` : ""}
</div>`,
  )
  .join("\n")}
<p style="font-size:13px;color:#7D8A9C;margin:18px 0 0">Sent the evening before by My Office Bot. Plans change? Check the Schedule in the app.</p>
</div>`;

  const text = [
    `Tomorrow: ${dayText}`,
    `Hi ${first}, here's your schedule for ${businessName}.`,
    "",
    ...items.flatMap((i) => [
      `${i.when}  ${i.customer ? `${i.customer} — ${i.what}` : i.what}`,
      ...(i.address ? [`  ${i.address}`] : []),
      ...(i.phone ? [`  ${i.phone}`] : []),
      ...(i.arrive ? [`  ${i.arrive}`] : []),
    ]),
  ].join("\n");

  return { subject: `Tomorrow's schedule: ${items.length} ${items.length === 1 ? "stop" : "stops"} (${dayText})`, html, text };
}

/** Sends tomorrow's schedule to everyone booked, for every active business. Safe to run more than once. */
export async function sendDailyDigests(now = new Date()): Promise<DigestReport> {
  const db = adminDb();
  const report: DigestReport = { accounts: 0, people: 0, sent: 0, skipped: 0, failed: 0 };
  const { data: accounts, error } = await db.from("accounts").select("id, name, timezone").neq("billing_status", "suspended");
  if (error) throw error;

  for (const a of accounts ?? []) {
    const day = tomorrowIn(a.timezone, now);
    report.date ??= day;
    const { data, error: rowsErr } = await db.rpc("digest_rows", { p_account: a.id, p_day: day });
    if (rowsErr) {
      console.error("digest rows failed", a.id, rowsErr);
      continue;
    }
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) continue;
    report.accounts++;

    const byPerson = new Map<string, Row[]>();
    for (const r of rows) byPerson.set(r.contact_id, [...(byPerson.get(r.contact_id) ?? []), r]);

    for (const [contactId, list] of byPerson) {
      report.people++;
      const key = `digest:${day}:${contactId}`;
      const { data: claim, error: claimErr } = await db
        .from("schedule_notifications")
        .insert({ account_id: a.id, contact_id: contactId, kind: "daily_digest", for_date: day, status: "dispatching", idempotency_key: key })
        .select("id")
        .single();
      if (claimErr) {
        if (claimErr.code === "23505") report.skipped++; // already sent today
        else {
          report.failed++;
          console.error("digest claim failed", claimErr);
        }
        continue;
      }

      const msg = digestEmail(a.name, list[0]!.contact_name, day, list);
      const res = await sendEmail({ to: list[0]!.email, ...msg, idempotencyKey: key });
      await db
        .from("schedule_notifications")
        .update(
          res.ok
            ? { status: "sent", provider_sid: res.id, updated_at: new Date().toISOString() }
            : { status: res.retryable ? "uncertain" : "failed", error: res.error, updated_at: new Date().toISOString() },
        )
        .eq("id", claim.id);
      if (res.ok) report.sent++;
      else report.failed++;
    }
  }
  return report;
}
