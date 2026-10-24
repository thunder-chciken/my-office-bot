import { createHmac, timingSafeEqual } from "node:crypto";

// Signed "Save to phone contacts" links (D55). Phones often open a contact card in a separate
// browser window that isn't signed in (iPhone home-screen apps especially), so the card URL itself
// carries proof: which lead/customer, an expiry, and a signature. No names or numbers in the URL.

export type CardKind = "lead" | "customer";

function key() {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("No server secret to sign contact links with");
  return createHmac("sha256", secret).update("my-office-bot/vcard-link/v1").digest();
}

const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url").slice(0, 32);

export function cardToken(kind: CardKind, id: string, validDays = 30) {
  const exp = Math.floor(Date.now() / 1000) + validDays * 86_400;
  const payload = `${kind}.${id}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function readCardToken(token: string): { kind: CardKind; id: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [kind, id, exp, sig] = parts as [string, string, string, string];
  if (kind !== "lead" && kind !== "customer") return null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return null;
  const expected = Buffer.from(sign(`${kind}.${id}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { kind, id };
}
