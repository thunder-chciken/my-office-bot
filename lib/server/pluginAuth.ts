import { createHmac, timingSafeEqual } from "node:crypto";
import { adminDb } from "./db";

// Checks a signed request from the WordPress plugin (D57).
// Headers: X-MOB-Site (the site's form key), X-MOB-Timestamp (unix seconds), X-MOB-Signature
// (hex HMAC-SHA256 of "timestamp.body" with the site's plugin secret). Old or future timestamps are refused,
// so a captured request can't be replayed later; within the window, duplicates are caught by event id.

const WINDOW_SECONDS = 300;

export type PluginSite = { id: string; account_id: string; public_key: string };

export async function verifyPluginRequest(request: Request, rawBody: string): Promise<PluginSite | null> {
  const key = request.headers.get("x-mob-site") ?? "";
  const ts = request.headers.get("x-mob-timestamp") ?? "";
  const sig = request.headers.get("x-mob-signature") ?? "";
  if (!/^[0-9a-f]{16,64}$/i.test(key) || !/^\d{9,11}$/.test(ts) || !/^[0-9a-f]{64}$/i.test(sig)) return null;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > WINDOW_SECONDS) return null;

  const { data: site } = await adminDb()
    .from("sites")
    .select("id, account_id, public_key, plugin_secret")
    .eq("public_key", key)
    .maybeSingle();
  if (!site?.plugin_secret) return null;

  const expected = Buffer.from(createHmac("sha256", site.plugin_secret).update(`${ts}.${rawBody}`).digest("hex"));
  const given = Buffer.from(sig.toLowerCase());
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { id: site.id, account_id: site.account_id, public_key: site.public_key };
}

export async function notePluginSeen(siteId: string, info: { version?: unknown; siteUrl?: unknown }) {
  await adminDb()
    .from("sites")
    .update({
      plugin_last_seen_at: new Date().toISOString(),
      ...(typeof info.version === "string" ? { plugin_version: info.version.slice(0, 20) } : {}),
      ...(typeof info.siteUrl === "string" ? { plugin_site_url: info.siteUrl.slice(0, 300) } : {}),
    })
    .eq("id", siteId);
}
