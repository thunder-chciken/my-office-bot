// Maps the field names common form builders use onto our lead fields (SPEC §10).
// Only these fields are kept; anything else a website form sends is dropped.

const fieldAliases = {
  name: ["name", "full_name", "fullname", "your-name", "your_name", "contact_name", "names"],
  phone: ["phone", "tel", "telephone", "your-phone", "your_phone", "phone_number", "mobile", "cell"],
  email: ["email", "your-email", "your_email", "email_address", "e-mail"],
  message: ["message", "your-message", "your_message", "comments", "comment", "details", "description", "notes"],
  service: ["service", "services", "project", "project_type", "subject", "your-subject", "service_needed"],
  address: ["address", "street", "street_address", "location", "city", "zip", "zipcode"],
} as const;

export type LeadFields = Record<keyof typeof fieldAliases, string>;

const MAX = { name: 120, phone: 40, email: 200, message: 4000, service: 200, address: 300 } as const;

export function normalizeLead(raw: Record<string, unknown>): LeadFields {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" || typeof v === "number") lower[k.toLowerCase().trim()] = String(v).trim();
  }
  const out = {} as LeadFields;
  for (const [field, aliases] of Object.entries(fieldAliases) as [keyof LeadFields, readonly string[]][]) {
    const value = aliases.map((a) => lower[a]).find(Boolean) ?? "";
    out[field] = value.slice(0, MAX[field]);
  }
  // Separate first/last name fields (e.g. Gravity Forms, WPForms)
  if (!out.name && (lower["first"] || lower["first_name"] || lower["last"] || lower["last_name"])) {
    out.name = [lower["first"] ?? lower["first_name"], lower["last"] ?? lower["last_name"]].filter(Boolean).join(" ");
  }
  out.email = out.email.toLowerCase();
  return out;
}

export const emergencyWords =
  /\b(leak|leaking|flood|flooding|no heat|no ac|no air|burst|emergency|sparking|gas smell|water damage)\b/i;

export function countLinks(text: string) {
  return (text.match(/https?:\/\/|www\./gi) ?? []).length;
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function phoneDigits(phone: string) {
  return phone.replace(/\D/g, "");
}
