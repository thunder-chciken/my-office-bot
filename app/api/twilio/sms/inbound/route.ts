import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/db";
import { formParams, twiml, validTwilioSignature } from "@/lib/server/twilio";

// Texts sent to our Twilio number (D56). YES confirms someone who was invited to text alerts;
// STOP / START flip the opt-out. Twilio itself answers STOP, START and HELP.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATH = "/api/twilio/sms/inbound";

export async function POST(request: Request) {
  const params = await formParams(request);
  if (!validTwilioSignature(PATH, params, request.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const { data: reply, error } = await adminDb().rpc("sms_inbound", {
    p_from: params.From ?? "",
    p_body: params.Body ?? "",
    p_message_sid: params.MessageSid ?? "",
  });
  if (error) {
    console.error("sms inbound failed", error);
    return twiml(null);
  }
  return twiml(reply as string | null);
}
