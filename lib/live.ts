"use client";

import type { Account } from "./account";
import type { Contact, LeadStatus } from "./data";
import type { Customer } from "./customers";
import type { Job, ScheduleEvent } from "./schedule";
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

export async function saveCustomer(c: Customer): Promise<Result & { id?: string }> {
  const { data, error } = await browserClient().rpc("save_customer", {
    p_id: c.id || null,
    p_name: c.name,
    p_phone: c.phone,
    p_email: c.email,
    p_address: c.address,
    p_notes: c.notes,
  });
  return { id: data as string | undefined, error: message(error) };
}

export async function deleteCustomer(id: string): Promise<Result> {
  const { error } = await browserClient().rpc("delete_customer", { p_id: id });
  return { error: message(error) };
}

// ---- schedule (D54): the database converts day + minutes to real times in the business's time zone.

export async function saveBooking(
  e: ScheduleEvent,
  newJob?: Job,
): Promise<Result & { eventId?: string; jobId?: string }> {
  const { data, error } = await browserClient().rpc("save_booking", {
    p_event: {
      id: e.id,
      job_id: newJob ? null : (e.jobId ?? null),
      type: e.type,
      kind: e.kind ?? null,
      title: e.title,
      status: e.status,
      date: e.date,
      from: e.from,
      to: e.to,
      workdays: e.workdays,
      skip_weekends: e.skipWeekends,
      arrive_from: e.arrive?.from ?? null,
      arrive_to: e.arrive?.to ?? null,
      override_reason: e.overrideReason ?? null,
      crew_ids: e.crewIds,
      person_ids: e.personIds,
    },
    p_job: newJob
      ? {
          lead_id: newJob.leadId ?? null,
          title: newJob.title,
          customer_name: newJob.customerName,
          phone: newJob.phone,
          email: newJob.email,
          address: newJob.address,
        }
      : null,
  });
  const ids = data as { event_id?: string; job_id?: string } | null;
  return { eventId: ids?.event_id, jobId: ids?.job_id ?? undefined, error: message(error) };
}

export async function saveEventStatus(id: string, status: ScheduleEvent["status"]): Promise<Result> {
  const { error } = await browserClient().rpc("set_event_status", { p_id: id, p_status: status });
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
