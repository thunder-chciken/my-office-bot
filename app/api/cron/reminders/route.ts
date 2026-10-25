import { NextResponse } from "next/server";
import { reminderTokenMatches, sendReminders } from "@/lib/server/reminders";

// The database calls this (pg_cron + pg_net, migration 0014) when leads have waited past the business's reminder
// time with nobody on them: { leads: [ids] } with "Authorization: Bearer <token the database made>".
// Anyone else gets a 401. Leads that are no longer due (claimed, replied, already reminded) are skipped.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  try {
    if (!given || !(await reminderTokenMatches(given))) return NextResponse.json({ ok: false }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { leads?: unknown };
    const ids = (Array.isArray(body.leads) ? body.leads : []).filter((v): v is string => typeof v === "string" && UUID.test(v)).slice(0, 50);
    if (!ids.length) return NextResponse.json({ ok: true, reminded: 0 });
    const report = await sendReminders(ids);
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    console.error("reminders failed", e);
    return NextResponse.json({ ok: false, error: "reminders failed" }, { status: 500 });
  }
}
