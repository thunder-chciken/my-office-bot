import { NextResponse } from "next/server";

// Website forms post here (directly, via the embed script, or from WordPress/Zapier webhooks).
// Prototype: validates and echoes the lead. Production: save to Supabase, then hand off to a
// durable job (Inngest) that texts/emails/calls each contact via Twilio + Resend with retries.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Common field names from Contact Form 7, Gravity Forms, WPForms, Bricks, Webflow, etc.
const fieldAliases = {
  name: ["name", "full_name", "fullname", "your-name", "first_name", "contact_name"],
  phone: ["phone", "tel", "telephone", "your-phone", "phone_number", "mobile"],
  email: ["email", "your-email", "email_address", "e-mail"],
  message: ["message", "your-message", "comments", "details", "description", "notes"],
  service: ["service", "services", "project", "project_type", "subject", "your-subject"],
  address: ["address", "street", "location", "city", "zip"],
};

type Normalized = Record<keyof typeof fieldAliases, string>;

function normalize(raw: Record<string, unknown>): Normalized {
  const lower = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), String(v ?? "").trim()]));
  const out = {} as Normalized;
  for (const [field, aliases] of Object.entries(fieldAliases)) {
    out[field as keyof Normalized] = aliases.map((a) => lower[a]).find(Boolean) ?? "";
  }
  return out;
}

const emergencyWords = /\b(leak|leaking|flood|flooding|no heat|no ac|no air|burst|emergency|sparking|gas smell)\b/i;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  let raw: Record<string, unknown>;
  try {
    const type = req.headers.get("content-type") ?? "";
    raw = type.includes("application/json") ? await req.json() : Object.fromEntries(await req.formData());
  } catch {
    return NextResponse.json({ ok: false, error: "Unreadable form data" }, { status: 400, headers: cors });
  }

  const lead = normalize(raw);
  if (!lead.phone && !lead.email) {
    return NextResponse.json({ ok: false, error: "Need a phone number or email" }, { status: 422, headers: cors });
  }

  const urgent = emergencyWords.test(`${lead.service} ${lead.message}`);

  // TODO(production):
  // 1. Look up accountId in Supabase; reject unknown accounts and rate-limit by IP.
  // 2. Insert the lead row (keeps the raw payload for debugging).
  // 3. await inngest.send({ name: "lead/received", data: { leadId, accountId, urgent } })
  //    -> the job fans out SMS / email / voice per contact and escalates if nobody replies.

  return NextResponse.json({ ok: true, accountId, urgent, lead }, { status: 202, headers: cors });
}
