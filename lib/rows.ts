import type { AlertEvent, Lead, LeadStatus } from "./data";
import type { Customer } from "./customers";

// Database rows → what the screens show. Shared by the /app page load and the live refresh,
// so a lead looks the same whether it came with the page or arrived while the app was open.

export const LEAD_SELECT =
  "id, name, phone, email, service, message, address, urgency, state, received_at, channel, extra, lead_events(type, data, created_at), lead_notes(id, body, created_at)";
export const CUSTOMER_SELECT = "id, name, phone, email, address, notes, source, created_at, leads(id)";

export type LeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  service: string | null;
  message: string | null;
  address: string | null;
  urgency: string;
  state: string;
  received_at: string;
  channel: string;
  extra: { builder?: string; form?: string } | null;
  lead_events: { type: string; data: Record<string, unknown> | null; created_at: string }[];
  lead_notes: { id: string; body: string; created_at: string }[] | null;
};

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  source: "lead" | "manual";
  created_at: string;
  leads: { id: string }[];
};

const statusFor: Record<string, LeadStatus> = { contacted: "contacted", closed: "booked" };
const builderNames: Record<string, string> = {
  bricks: "Bricks",
  divi: "Divi",
  cf7: "Contact Form 7",
  wpforms: "WPForms",
  gravity: "Gravity Forms",
  elementor: "Elementor",
  fluentform: "Fluent Forms",
};

export const minutesSince = (iso: string, now = Date.now()) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));

export function leadFromRow(l: LeadRow, nameForEmail: (to: unknown) => string, now = Date.now()): Lead {
  const ago = (iso: string) => minutesSince(iso, now);
  return {
    id: l.id,
    name: l.name || "Website visitor",
    service: l.service || "Website lead",
    message: l.message || "",
    phone: l.phone ?? "",
    email: l.email ?? "",
    address: l.address ?? "",
    minutesAgo: ago(l.received_at),
    status: statusFor[l.state] ?? "new",
    // Plugin leads say which builder and form they came from (D57); the plugin's own chat bubble just says so (D59).
    source:
      l.channel === "plugin" && l.extra?.builder === "bubble"
        ? "Chat bubble"
        : l.channel === "plugin" && l.extra?.builder
        ? [builderNames[l.extra.builder] ?? l.extra.builder, l.extra.form].filter(Boolean).join(" · ")
        : "Website form",
    urgent: l.urgency === "urgent",
    alerts: [...l.lead_events]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .flatMap((e): AlertEvent[] => {
        const at = ago(e.created_at);
        if (e.type === "alert_sent" && e.data?.channel === "push") {
          const n = Number(e.data?.devices ?? 1);
          return [{ minutesAgo: at, text: `Phone notification to ${n} ${n === 1 ? "phone" : "phones"}`, ok: true }];
        }
        if (e.type === "alert_sent" && e.data?.channel === "sms") return [{ minutesAgo: at, text: `Texted ${String(e.data?.name ?? "")}`, ok: true }];
        if (e.type === "alert_sent") return [{ minutesAgo: at, text: `Emailed ${nameForEmail(e.data?.to)}`, ok: true }];
        if (e.type === "alert_failed")
          return [{ minutesAgo: at, text: e.data?.channel === "sms" ? `Text to ${String(e.data?.name ?? "")} didn't go through` : "Email alert didn't go through", ok: false }];
        return [];
      }),
    notes: [...(l.lead_notes ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((n) => ({ id: n.id, text: n.body, minutesAgo: ago(n.created_at) })),
  };
}

export function customerFromRow(c: CustomerRow, now = Date.now()): Customer {
  return {
    id: c.id,
    name: c.name || "Website visitor",
    phone: c.phone ?? "",
    email: c.email ?? "",
    address: c.address ?? "",
    notes: c.notes ?? "",
    source: c.source,
    createdMinutesAgo: minutesSince(c.created_at, now),
    leadIds: c.leads.map((l) => l.id),
  };
}
