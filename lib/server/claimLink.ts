import { createHmac, timingSafeEqual } from "node:crypto";

// Signed "I'm on it" links in alert emails (D64). Each alert email is for one person, so the link carries
// which lead and which team member, an expiry and a signature. Anyone holding the email can claim for that
// person, which is what the email is for; nothing else about the business is reachable through it.

function key() {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("No server secret to sign claim links with");
  return createHmac("sha256", secret).update("my-office-bot/claim-link/v1").digest();
}

const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url").slice(0, 32);
const UUID = /^[0-9a-f-]{36}$/i;

export function claimToken(leadId: string, contactId: string, validDays = 7) {
  const exp = Math.floor(Date.now() / 1000) + validDays * 86_400;
  const payload = `${leadId}.${contactId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function readClaimToken(token: string): { leadId: string; contactId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [leadId, contactId, exp, sig] = parts as [string, string, string, string];
  if (!UUID.test(leadId) || !UUID.test(contactId) || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return null;
  const expected = Buffer.from(sign(`${leadId}.${contactId}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { leadId, contactId };
}

export const claimUrl = (leadId: string, contactId: string) =>
  `${process.env.PUBLIC_BASE_URL ?? "https://myofficebot.app"}/on-it?t=${encodeURIComponent(claimToken(leadId, contactId))}`;
