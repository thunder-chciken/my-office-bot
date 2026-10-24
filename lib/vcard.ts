import { toE164 } from "./phone";

// A contact card (vCard 3.0) that iPhone and Android open straight into their Contacts app.

export type CardPerson = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  note?: string | null;
};

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

export function vcard(p: CardPerson) {
  const name = p.name.trim() || "Customer";
  const parts = name.split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : "";
  const first = parts.join(" ");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${esc(name)}`,
    `N:${esc(last)};${esc(first)};;;`,
  ];
  const phone = p.phone ? toE164(p.phone) : "";
  if (phone) lines.push(`TEL;TYPE=CELL:${phone}`);
  if (p.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(p.email)}`);
  if (p.address) lines.push(`ADR;TYPE=HOME:;;${esc(p.address)};;;;`);
  if (p.note) lines.push(`NOTE:${esc(p.note)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n") + "\r\n";
}

export const cardFileName = (name: string) =>
  `${(name.trim() || "customer").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60) || "customer"}.vcf`;
