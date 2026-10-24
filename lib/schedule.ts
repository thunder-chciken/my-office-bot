// Scheduling model for the prototype (docs/SCHEDULING.md). Mirrors supabase/migrations/0003_scheduling.sql:
// events occupy half-open time slots, a multi-day project only reserves its daily working hours,
// and a person reached through two crews counts once. Times are minutes from midnight, dates "YYYY-MM-DD".

import type { Contact, Lead } from "./data";

export type EventType = "appointment" | "work_block" | "unavailable";
export type ApptKind = "estimate" | "inspection" | "service";
export type EventStatus = "scheduled" | "confirmed" | "done" | "canceled";

export type Crew = { id: string; name: string; color: string; memberIds: string[] };

export type Job = {
  id: string;
  leadId?: string;
  title: string;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  status: "open" | "done" | "canceled";
};

export type ScheduleEvent = {
  id: string;
  jobId?: string;
  type: EventType;
  kind?: ApptKind;
  title: string;
  status: EventStatus;
  date: string; // first day
  from: number; // start time (each day, for a project)
  to: number; // end time (each day, for a project)
  workdays: number; // projects only; 1 for everything else
  skipWeekends: boolean;
  arrive?: { from: number; to: number }; // what the homeowner is told, separate from the start time
  crewIds: string[];
  personIds: string[];
  overrideReason?: string;
};

export type Slot = { date: string; from: number; to: number };

export const kindLabel: Record<ApptKind, string> = {
  estimate: "Estimate",
  inspection: "Inspection",
  service: "Service call",
};

export const typeLabel: Record<EventType, string> = {
  appointment: "Appointment",
  work_block: "Project",
  unavailable: "Time off",
};

// ---------- dates

export function dateKey(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDays(key: string, n: number) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export const todayKey = () => dateKey(new Date());

export const isWeekend = (key: string) => [0, 6].includes(parseKey(key).getDay());

export function nextWorkday(key: string, skipWeekends = true) {
  let k = addDays(key, 1);
  while (skipWeekends && isWeekend(k)) k = addDays(k, 1);
  return k;
}

export function weekStart(key: string) {
  const d = parseKey(key);
  const back = (d.getDay() + 6) % 7; // Monday-based weeks
  return addDays(key, -back);
}

export function dayLabel(key: string, style: "long" | "short" = "long") {
  const today = todayKey();
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  if (key === addDays(today, -1)) return "Yesterday";
  return parseKey(key).toLocaleDateString("en-US", {
    weekday: style === "long" ? "long" : "short",
    month: "short",
    day: "numeric",
  });
}

export function fmtTime(min: number) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

export const fmtRange = (from: number, to: number) => `${fmtTime(from)}–${fmtTime(to)}`;

export const toTimeInput = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function fromTimeInput(v: string) {
  const [h, m] = v.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// ---------- slots & conflicts

/** The days an event covers, each with the hours it actually occupies. */
export function slots(e: ScheduleEvent): Slot[] {
  if (e.type !== "work_block") return [{ date: e.date, from: e.from, to: e.to }];
  const out: Slot[] = [];
  let k = e.date;
  while (e.skipWeekends && isWeekend(k)) k = addDays(k, 1);
  while (out.length < e.workdays) {
    out.push({ date: k, from: e.from, to: e.to });
    k = e.skipWeekends ? nextWorkday(k) : addDays(k, 1);
  }
  return out;
}

export const lastDay = (e: ScheduleEvent) => slots(e).at(-1)!.date;

export function people(e: Pick<ScheduleEvent, "crewIds" | "personIds">, crews: Crew[]) {
  const ids = new Set(e.personIds);
  for (const c of crews) if (e.crewIds.includes(c.id)) c.memberIds.forEach((m) => ids.add(m));
  return [...ids];
}

export type Conflict = { event: ScheduleEvent; personId: string; slot: Slot };

/** Live events that share a person and overlapping time with `draft`. Half-open: 10–12 and 12–1 don't clash. */
export function findConflicts(draft: ScheduleEvent, events: ScheduleEvent[], crews: Crew[]): Conflict[] {
  if (draft.status === "canceled") return [];
  const mine = slots(draft);
  const who = people(draft, crews);
  const out: Conflict[] = [];
  for (const other of events) {
    if (other.id === draft.id || other.status === "canceled") continue;
    const shared = people(other, crews).filter((p) => who.includes(p));
    if (shared.length === 0) continue;
    const hit = slots(other).find((o) => mine.some((m) => m.date === o.date && m.from < o.to && o.from < m.to));
    if (hit) shared.forEach((personId) => out.push({ event: other, personId, slot: hit }));
  }
  return out;
}

/** Conflicts a move creates, ignoring clashes that were already there before it (same rule as the database). */
export function newConflicts(before: ScheduleEvent, after: ScheduleEvent, events: ScheduleEvent[], crews: Crew[]) {
  const had = findConflicts(before, events, crews);
  return findConflicts(after, events, crews).filter(
    (c) => !had.some((h) => h.event.id === c.event.id && h.personId === c.personId),
  );
}

/** Events on a given day, earliest first. A project shows on each of its working days. */
export function eventsOn(key: string, events: ScheduleEvent[]) {
  return events
    .filter((e) => e.status !== "canceled" && slots(e).some((s) => s.date === key))
    .sort((a, b) => a.from - b.from || a.title.localeCompare(b.title));
}

/** "Day 2 of 3" for a project on one of its days. */
export function projectDay(e: ScheduleEvent, key: string) {
  const i = slots(e).findIndex((s) => s.date === key);
  return i < 0 ? "" : `Day ${i + 1} of ${e.workdays}`;
}

export function whoLabel(e: ScheduleEvent, crews: Crew[], contacts: Contact[]) {
  const names = [
    ...crews.filter((c) => e.crewIds.includes(c.id)).map((c) => c.name),
    ...contacts.filter((c) => e.personIds.includes(c.id)).map((c) => c.name),
  ];
  return names.length ? names.join(", ") : "Nobody assigned";
}

// ---------- building events

let seq = 0;
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function blankEvent(type: EventType, date: string): ScheduleEvent {
  const base = {
    id: newId("e"),
    type,
    status: "scheduled" as const,
    date,
    workdays: 1,
    skipWeekends: true,
    crewIds: [],
    personIds: [],
  };
  if (type === "work_block") return { ...base, title: "", from: 8 * 60, to: 17 * 60, workdays: 3 };
  if (type === "unavailable") return { ...base, title: "Time off", from: 0, to: 24 * 60 };
  return { ...base, kind: "estimate", title: "", from: 9 * 60, to: 10 * 60 };
}

export function jobFromLead(lead: Lead): Job {
  return {
    id: newId("j"),
    leadId: lead.id,
    title: lead.service,
    customerName: lead.name,
    phone: lead.phone,
    email: lead.email,
    address: lead.address,
    status: "open",
  };
}

/** The text the contractor sends the homeowner from their own phone. */
export function homeownerMessage(e: ScheduleEvent, job: Job, businessName: string, moved: boolean) {
  const first = job.customerName.split(" ")[0] ?? job.customerName;
  const when =
    e.type === "work_block"
      ? `${dayLabel(e.date)} through ${dayLabel(lastDay(e))}, starting around ${fmtTime(e.from)}`
      : `${dayLabel(e.date)}, arriving ${e.arrive ? `between ${fmtRange(e.arrive.from, e.arrive.to)}` : `at ${fmtTime(e.from)}`}`;
  const what = e.type === "work_block" ? `your ${job.title.toLowerCase()}` : `your ${(e.kind ? kindLabel[e.kind] : "visit").toLowerCase()}`;
  return moved
    ? `Hi ${first}, this is ${businessName}. We've moved ${what} to ${when}. Reply here if that doesn't work.`
    : `Hi ${first}, this is ${businessName}. You're booked for ${what}: ${when}. Reply here if anything changes.`;
}

// ---------- seed data (relative to today, so the demo always looks current)

export const seedCrews: Crew[] = [
  { id: "cr1", name: "Roof crew", color: "#0A6CFF", memberIds: ["c3"] },
  { id: "cr2", name: "Tile crew", color: "#17A34A", memberIds: ["c3"] },
];

export function seedSchedule() {
  const t = todayKey();
  const mon = weekStart(t);
  const jobs: Job[] = [
    {
      id: "j1",
      leadId: "l5",
      title: "Full roof replacement",
      customerName: "Karen Brooks",
      phone: "(512) 555-0102",
      email: "kbrooks@example.com",
      address: "2100 Barton Springs Rd, Austin, TX 78746",
      status: "open",
    },
    {
      id: "j2",
      title: "Roof replacement",
      customerName: "Ellen Johnson",
      phone: "(512) 555-0110",
      email: "ellen.j@example.com",
      address: "1800 Congress Ave, Austin, TX 78701",
      status: "open",
    },
    {
      id: "j3",
      title: "Shower tile",
      customerName: "Sam Patel",
      phone: "(737) 555-0131",
      email: "sam.patel@example.com",
      address: "2201 William Barton Dr, Austin, TX 78746",
      status: "open",
    },
    {
      id: "j4",
      leadId: "l4",
      title: "Kitchen backsplash tile",
      customerName: "Tom Alvarez",
      phone: "(512) 555-0164",
      email: "tom.alvarez@example.com",
      address: "2001 Robert Dedman Dr, Austin, TX 78712",
      status: "open",
    },
  ];
  const events: ScheduleEvent[] = [
    {
      id: "e1",
      jobId: "j1",
      type: "appointment",
      kind: "estimate",
      title: "Roof estimate",
      status: "confirmed",
      date: t,
      from: 9 * 60,
      to: 10 * 60,
      workdays: 1,
      skipWeekends: true,
      arrive: { from: 9 * 60, to: 11 * 60 },
      crewIds: [],
      personIds: ["c1"],
    },
    {
      id: "e2",
      jobId: "j2",
      type: "work_block",
      title: "Roof replacement",
      status: "scheduled",
      date: isWeekend(t) ? nextWorkday(t) : t,
      from: 8 * 60,
      to: 17 * 60,
      workdays: 3,
      skipWeekends: true,
      crewIds: ["cr1"],
      personIds: [],
    },
    {
      id: "e3",
      jobId: "j3",
      type: "work_block",
      title: "Shower tile",
      status: "scheduled",
      date: addDays(mon, 14),
      from: 8 * 60,
      to: 16 * 60,
      workdays: 4,
      skipWeekends: true,
      crewIds: ["cr2"],
      personIds: [],
    },
    {
      id: "e4",
      type: "unavailable",
      title: "Jenna — dentist",
      status: "scheduled",
      date: nextWorkday(t),
      from: 13 * 60,
      to: 15 * 60,
      workdays: 1,
      skipWeekends: true,
      crewIds: [],
      personIds: ["c2"],
    },
  ];
  return { jobs, events };
}
