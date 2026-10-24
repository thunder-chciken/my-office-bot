"use client";

import type { Account } from "./account";
import type { Contact, LeadStatus } from "./data";
import { browserClient } from "./supabase/client";

// Saves for a signed-in account. Each one calls a database function (0005) that works out the
// person's own account and checks permissions, so the browser never writes tables directly.
// Errors come back as the plain sentence the function raised ("At least one person has to get lead alerts").

type Result = { error?: string };

const message = (e: { message: string } | null) => (e ? e.message || "Couldn't save. Try again." : undefined);

export async function saveBusiness(a: Account): Promise<Result> {
  const { error } = await browserClient().rpc("update_my_business", {
    p_name: a.name,
    p_phone: a.phone,
    p_city: a.city,
    p_timezone: a.timezone,
    p_trades: a.trades,
    p_website: a.website,
  });
  return { error: message(error) };
}

export async function saveContact(c: Contact, isNew: boolean): Promise<Result & { id?: string }> {
  const { data, error } = await browserClient().rpc("save_contact", {
    p_id: isNew ? null : c.id,
    p_name: c.name,
    p_role: c.role,
    p_phone: c.phone,
    p_email: c.email,
    p_alert_email: c.channels.email,
  });
  return { id: data as string | undefined, error: message(error) };
}

export async function removeContact(id: string): Promise<Result> {
  const { error } = await browserClient().rpc("remove_contact", { p_id: id });
  return { error: message(error) };
}

export async function saveLeadStatus(id: string, status: LeadStatus): Promise<Result> {
  const { error } = await browserClient().rpc("set_lead_status", { p_lead: id, p_status: status });
  return { error: message(error) };
}

export const timezones = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
];
