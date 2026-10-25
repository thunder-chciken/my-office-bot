"use server";

import { inviteText, SELF_TEXT_CONSENT, welcomeText } from "@/lib/consent";
import { sendSms } from "@/lib/server/twilio";
import { pushToAccount } from "@/lib/server/push";
import { serverClient } from "@/lib/supabase/server";

// Turning text alerts on and off for a person (D56). The database decides whether consent is
// recorded now (the owner ticking the box for their own number) or needs a YES reply; this
// action then sends the confirmation or welcome text.

export type TextState = "on" | "pending";

export async function turnOnTexts(contactId: string, selfConsent: boolean): Promise<{ state?: TextState; note?: string; error?: string }> {
  const supabase = await serverClient();
  const { data: state, error } = await supabase.rpc("request_text_alerts", {
    p_contact: contactId,
    p_self_consent: selfConsent,
    p_wording: selfConsent ? SELF_TEXT_CONSENT : null,
  });
  if (error) return { error: error.message };

  const [{ data: person }, { data: membership }] = await Promise.all([
    supabase.from("contacts").select("name, phone").eq("id", contactId).maybeSingle(),
    supabase.from("memberships").select("accounts(name, sms_status)").limit(1).maybeSingle(),
  ]);
  const acct = membership?.accounts as unknown as { name: string; sms_status: string } | null;
  const active = acct?.sms_status === "active";
  const business = acct?.name ?? "your business";
  const { data: owner } = await supabase.from("contacts").select("name").eq("role_label", "Owner").limit(1).maybeSingle();
  const ownerFirst = (owner?.name ?? "Your boss").split(" ")[0]!;

  if (state === "pending") {
    if (!active) {
      return { state, note: `Saved. We'll text ${person?.name} to confirm as soon as text alerts are approved for your business.` };
    }
    const sent = await sendSms(person!.phone!, inviteText(ownerFirst, business));
    return sent.ok
      ? { state, note: `We texted ${person?.name}. Alerts start when they reply YES.` }
      : { state, note: `Saved, but the confirmation text didn't go through (${sent.error}).` };
  }

  if (!active) return { state: "on", note: "Saved. Your texts start as soon as text alerts are approved for your business." };
  const sent = await sendSms(person!.phone!, welcomeText(business));
  return { state: "on", note: sent.ok ? "Text alerts are on. We just sent you a test text." : `Saved, but the test text didn't go through (${sent.error}).` };
}

export async function turnOffTexts(contactId: string): Promise<{ error?: string }> {
  const supabase = await serverClient();
  const { error } = await supabase.rpc("stop_text_alerts", { p_contact: contactId });
  return { error: error?.message };
}

// "Send a test" on the phone notifications card (D63): only to this device, and only if it's the
// signed-in person's own saved device (RLS hides everyone else's).
export async function sendTestPush(endpoint: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await serverClient();
  const { data: sub } = await supabase.from("push_subscriptions").select("account_id").eq("endpoint", endpoint).maybeSingle();
  if (!sub) return { ok: false, error: "Turn notifications on for this phone first." };
  const { sent } = await pushToAccount(sub.account_id as string, {
    title: "My Office Bot test",
    body: "Phone notifications are working. New leads will pop up just like this.",
    url: "/app",
    tag: "test",
  }, { endpoint });
  return sent ? { ok: true } : { ok: false, error: "Couldn't reach this phone. Try turning notifications off and on again." };
}
