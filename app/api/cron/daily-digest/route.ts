import { NextResponse } from "next/server";
import { sendDailyDigests } from "@/lib/server/digest";

// Vercel Cron calls this once a day (vercel.json) with "Authorization: Bearer $CRON_SECRET".
// Anyone else gets a 401. Re-running the same day sends nothing twice.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const report = await sendDailyDigests();
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    console.error("daily digest failed", e);
    return NextResponse.json({ ok: false, error: "digest failed" }, { status: 500 });
  }
}
