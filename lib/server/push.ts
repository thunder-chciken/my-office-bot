import webpush from "web-push";
import { VAPID_PUBLIC_KEY } from "@/lib/push-key";
import { adminDb } from "./db";

// Phone notifications (web push, D63): a pop-up on every phone or browser that turned them on for the business.
// Free and opt-in in the person's own browser, so none of the texting rules apply. Never blocks the email alert.

export type PushMessage = { title: string; body: string; url: string; tag?: string };

let ready: boolean | null = null;
function setup() {
  if (ready === null) {
    const key = process.env.VAPID_PRIVATE_KEY;
    ready = !!key;
    if (key) webpush.setVapidDetails("mailto:support@myofficebot.app", VAPID_PUBLIC_KEY, key);
    else console.warn("VAPID_PRIVATE_KEY is not set; phone notifications are off");
  }
  return ready;
}

/** Sends to every saved device of the business (or one person's devices). Dead devices are removed. */
export async function pushToAccount(
  accountId: string,
  message: PushMessage,
  only?: { userId?: string; endpoint?: string },
): Promise<{ sent: number; failed: number }> {
  if (!setup()) return { sent: 0, failed: 0 };
  const db = adminDb();
  let query = db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("account_id", accountId);
  if (only?.userId) query = query.eq("user_id", only.userId);
  if (only?.endpoint) query = query.eq("endpoint", only.endpoint);
  const { data: subs, error } = await query;
  if (error) throw error;

  const payload = JSON.stringify(message);
  const results = await Promise.allSettled(
    (subs ?? []).map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
        TTL: 60 * 60 * 24,
        urgency: "high",
        timeout: 8000,
      }),
    ),
  );

  let sent = 0;
  const gone: string[] = [];
  const ok: string[] = [];
  results.forEach((r, i) => {
    const sub = subs![i]!;
    if (r.status === "fulfilled") {
      sent++;
      ok.push(sub.id);
    } else {
      const code = (r.reason as { statusCode?: number })?.statusCode;
      // 404/410: the phone uninstalled the app or turned notifications off. Forget it.
      if (code === 404 || code === 410) gone.push(sub.id);
      else console.error("push failed", code, (r.reason as Error)?.message);
    }
  });
  if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  if (ok.length) await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).in("id", ok);
  return { sent, failed: results.length - sent };
}

/** "New lead: Pat Homeowner" · "Kitchen Remodeling · (918) 555-0142 · Want to open up the kitchen…" */
export function leadPush(
  lead: { id: string; name?: string | null; service?: string | null; phone?: string | null; message?: string | null },
  urgent: boolean,
): PushMessage {
  const who = lead.name?.trim() || "Website visitor";
  const snippet = (lead.message ?? "").replace(/\s+/g, " ").trim();
  const body = [lead.service?.trim(), lead.phone?.trim(), snippet.length > 90 ? `${snippet.slice(0, 90)}…` : snippet]
    .filter(Boolean)
    .join(" · ");
  return {
    title: `${urgent ? "Urgent lead" : "New lead"}: ${who}`,
    body: body || "Tap to see the details.",
    // With a phone number, tapping opens the lead scrolled to the quick text replies.
    url: `/app?lead=${encodeURIComponent(lead.id)}${lead.phone?.trim() ? "&do=reply" : ""}`,
    tag: `lead-${lead.id}`,
  };
}

/** The second reminder (D64): replaces the first pop-up for the same lead. "Still waiting: Pat Homeowner" */
export function reminderPush(
  lead: { id: string; name?: string | null; service?: string | null; phone?: string | null },
  waited: string,
): PushMessage {
  const who = lead.name?.trim() || "Website visitor";
  return {
    title: `Still waiting: ${who}`,
    body: `${waited} and nobody's on it yet.${lead.service?.trim() ? ` ${lead.service.trim()}.` : ""} Tap to reply.`,
    url: `/app?lead=${encodeURIComponent(lead.id)}${lead.phone?.trim() ? "&do=reply" : ""}`,
    tag: `lead-${lead.id}`,
  };
}
