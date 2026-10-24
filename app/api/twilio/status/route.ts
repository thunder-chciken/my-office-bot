import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/db";
import { formParams, TWILIO_OPTED_OUT, validTwilioSignature } from "@/lib/server/twilio";

// Delivery reports for our texts (D56): Twilio tells us when a text was delivered or failed.
// Matched to the alert by Twilio's message SID; a late "sent" never overwrites "delivered".

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATH = "/api/twilio/status";
const final: Record<string, "delivered" | "failed"> = { delivered: "delivered", undelivered: "failed", failed: "failed" };

export async function POST(request: Request) {
  const params = await formParams(request);
  if (!validTwilioSignature(PATH, params, request.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const sid = params.MessageSid ?? params.SmsSid ?? "";
  const status = final[params.MessageStatus ?? params.SmsStatus ?? ""];
  if (!sid || !status) return new NextResponse(null, { status: 204 });

  const db = adminDb();
  const errorCode = Number(params.ErrorCode || 0);
  const { data: attempt } = await db
    .from("notification_attempts")
    .update({
      status,
      provider_status: params.MessageStatus ?? null,
      error: status === "failed" ? `Twilio ${errorCode || "error"}` : null,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_sid", sid)
    .neq("status", "delivered")
    .select("contact_id")
    .maybeSingle();
  if (attempt && errorCode === TWILIO_OPTED_OUT) {
    await db.from("contacts").update({ phone_opted_out: true }).eq("id", attempt.contact_id);
  }
  return new NextResponse(null, { status: 204 });
}
