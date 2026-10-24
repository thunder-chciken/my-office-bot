// Phone numbers in the +1XXXXXXXXXX form that tel:, sms: links and contact cards expect.
// Shared by the browser and the server.
export function toE164(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}
