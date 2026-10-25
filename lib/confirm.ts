// The instant "we got your request" email to the homeowner (D64). Shared by the settings screen (preview)
// and the server (sending), so what the owner sees is what goes out.

export const CONFIRM_MAX_SUBJECT = 150;
export const CONFIRM_MAX_BODY = 2000;

export const defaultConfirmSubject = "We got your request, {name}";

export const defaultConfirmBody = `Hi {name},

Thanks for reaching out to {business}. We got your request for {service}, and someone from our team will get back to you shortly.

If it's urgent, call us at {phone}.

Thanks,
{business}`;

export type ConfirmValues = { name: string; business: string; service: string; phone: string };

/** Fills {name} (first name), {business}, {service} and {phone}. A line with an empty {phone} is dropped. */
export function fillConfirm(template: string, v: ConfirmValues) {
  const first = v.name.trim().split(/\s+/)[0] || "there";
  // "Kitchen remodel" reads as "your request for kitchen remodel"; "HVAC repair" keeps its capitals.
  const service = v.service.trim().replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase()) || "your project";
  return template
    .split("\n")
    .filter((line) => !(/\{phone\}/i.test(line) && !v.phone.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\{name\}/gi, first)
    .replace(/\{business\}/gi, v.business.trim() || "our team")
    .replace(/\{service\}/gi, service)
    .replace(/\{phone\}/gi, v.phone.trim());
}
