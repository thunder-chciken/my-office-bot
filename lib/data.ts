// Mock data for the prototype. In production this comes from Supabase.
// Addresses are public Austin-area landmarks (not homes) so Directions opens a real map pin.

export type LeadStatus = "new" | "contacted" | "booked";
export type Channel = "sms" | "email" | "call";

export type AlertEvent = {
  minutesAgo: number;
  text: string;
  ok: boolean;
};

/** A quick note on a lead ("left voicemail"), oldest first (D58). */
export type LeadNote = {
  id: string;
  text: string;
  minutesAgo: number;
};

/** Who's on a lead (D64): claimed with "I'm on it", from the app or an alert email. */
export type Claim = {
  name: string;
  contactId?: string;
  userId?: string;
  minutesAgo: number;
};

export type Lead = {
  id: string;
  name: string;
  service: string;
  message: string;
  phone: string;
  email: string;
  address: string;
  minutesAgo: number;
  /** When it arrived (ms), so "waiting" timers keep ticking between refreshes. */
  receivedAt?: number;
  status: LeadStatus;
  source: string;
  urgent?: boolean;
  alerts: AlertEvent[];
  notes?: LeadNote[];
  claimedBy?: Claim | null;
};

export type Contact = {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  channels: Record<Channel, boolean>;
  /** Text alerts in a real account (D56): on, waiting for a YES reply, opted out by STOP, or off. */
  sms?: "off" | "pending" | "on" | "opted_out";
};

export type Rules = {
  callAfterMinutes: 0 | 5 | 10 | 15;
  afterHours: boolean;
  emergencyCall: boolean;
};

export const business = {
  name: "Bluebird Home Services",
  city: "Austin, TX",
  website: "bluebirdhome.com",
  accountId: "bb-2841",
};

export const seedLeads: Lead[] = [
  {
    id: "l1",
    name: "Dana Whitfield",
    service: "Roof leak repair",
    message:
      "Water is coming through the ceiling in the upstairs bedroom after last night's storm. Can someone come look today?",
    phone: "(512) 555-0187",
    email: "dana.w@example.com",
    address: "1100 Congress Ave, Austin, TX 78701",
    minutesAgo: 4,
    status: "new",
    source: "Contact form",
    urgent: true,
    alerts: [
      { minutesAgo: 4, text: "Texted Matt", ok: true },
      { minutesAgo: 4, text: "Emailed Jenna (office)", ok: true },
      { minutesAgo: 4, text: "Called Matt — emergency word “leak”", ok: true },
    ],
  },
  {
    id: "l2",
    name: "Marcus Lee",
    service: "AC not cooling",
    message:
      "Upstairs unit is blowing warm air. Two-story house, unit is about 9 years old. Home after 3pm.",
    phone: "(512) 555-0133",
    email: "marcus.lee@example.com",
    address: "3400 E Palm Valley Blvd, Round Rock, TX 78665",
    minutesAgo: 18,
    status: "new",
    source: "Get a quote form",
    claimedBy: { name: "Jenna", contactId: "c2", minutesAgo: 6 },
    alerts: [
      { minutesAgo: 18, text: "Texted Matt", ok: true },
      { minutesAgo: 18, text: "Emailed Jenna (office)", ok: true },
      { minutesAgo: 13, text: "Called Matt — no reply in 5 min", ok: true },
    ],
  },
  {
    id: "l3",
    name: "Priya Raman",
    service: "Bathroom remodel",
    message:
      "We want to redo our main bath — walk-in shower with tile, new vanity. Hoping to start in the spring.",
    phone: "(737) 555-0119",
    email: "priya.r@example.com",
    address: "2313 Red River St, Austin, TX 78705",
    minutesAgo: 52,
    status: "new",
    source: "Contact form",
    alerts: [
      { minutesAgo: 52, text: "Texted Matt", ok: true },
      { minutesAgo: 52, text: "Emailed Jenna (office)", ok: true },
    ],
  },
  {
    id: "l4",
    name: "Tom Alvarez",
    service: "Kitchen backsplash tile",
    message: "About 30 sq ft of backsplash. I already have the tile picked out.",
    phone: "(512) 555-0164",
    email: "tom.alvarez@example.com",
    address: "2001 Robert Dedman Dr, Austin, TX 78712",
    minutesAgo: 190,
    status: "contacted",
    source: "Contact form",
    alerts: [
      { minutesAgo: 190, text: "Texted Matt", ok: true },
      { minutesAgo: 182, text: "You texted Tom back", ok: true },
    ],
    notes: [{ id: "n1", text: "Wants a quote by Friday. Tile is in his garage.", minutesAgo: 180 }],
  },
  {
    id: "l5",
    name: "Karen Brooks",
    service: "Full roof replacement",
    message: "Insurance approved a full replacement after hail. Need an estimate this week.",
    phone: "(512) 555-0102",
    email: "kbrooks@example.com",
    address: "2100 Barton Springs Rd, Austin, TX 78746",
    minutesAgo: 1500,
    status: "booked",
    source: "Get a quote form",
    alerts: [
      { minutesAgo: 1500, text: "Texted Matt", ok: true },
      { minutesAgo: 1492, text: "You called Karen", ok: true },
      { minutesAgo: 1480, text: "Booked for Thursday 9am", ok: true },
    ],
  },
  {
    id: "l6",
    name: "Jason Ortiz",
    service: "Furnace tune-up",
    message: "Want to get the furnace checked before it gets cold.",
    phone: "(512) 555-0176",
    email: "j.ortiz@example.com",
    address: "3600 Presidential Blvd, Austin, TX 78719",
    minutesAgo: 1580,
    status: "contacted",
    source: "Contact form",
    alerts: [
      { minutesAgo: 1580, text: "Texted Matt", ok: true },
      { minutesAgo: 1570, text: "You emailed Jason", ok: true },
    ],
  },
];

export const seedContacts: Contact[] = [
  {
    id: "c1",
    name: "Matt",
    role: "Owner",
    phone: "(512) 555-0142",
    email: "matt@bluebirdhome.com",
    channels: { sms: true, email: true, call: true },
  },
  {
    id: "c2",
    name: "Jenna",
    role: "Office",
    phone: "(512) 555-0158",
    email: "office@bluebirdhome.com",
    channels: { sms: false, email: true, call: false },
  },
  {
    id: "c3",
    name: "Luis",
    role: "Crew lead",
    phone: "(512) 555-0191",
    email: "luis@bluebirdhome.com",
    channels: { sms: true, email: false, call: false },
  },
];

export const seedRules: Rules = {
  callAfterMinutes: 5,
  afterHours: true,
  emergencyCall: true,
};

// Quick text replies (D58): a business can write up to 10 of its own; these are the starting set.
// {name} becomes the customer's first name when the reply is used.
export const builtInReplies = [
  "Hi {name}, thanks for reaching out! I'll call you within the hour.",
  "I can come take a look tomorrow. What time works for you?",
  "Can you text me a few photos of the problem?",
  "I'm on a job right now — I'll call you this afternoon.",
];
export const MAX_REPLIES = 10;
export const MAX_REPLY_LENGTH = 320;

export const fillReply = (text: string, name: string) => text.replace(/\{name\}/gi, firstName(name));

// Leads used by "Send a test lead" so the demo always has something fresh.
export const testLeadPool: Omit<Lead, "id" | "minutesAgo" | "status" | "alerts">[] = [
  {
    name: "Rachel Kim",
    service: "Storm damage inspection",
    message: "Hail last night. Some shingles in the yard. Can you check the roof and gutters?",
    phone: "(512) 555-0125",
    email: "rachel.kim@example.com",
    address: "2201 William Barton Dr, Austin, TX 78746",
    source: "Contact form",
    urgent: true,
  },
  {
    name: "Derek Owens",
    service: "No heat",
    message: "Furnace won't kick on and we have a newborn at home. Any chance of service tonight?",
    phone: "(512) 555-0148",
    email: "derek.owens@example.com",
    address: "1001 E University Ave, Georgetown, TX 78626",
    source: "Get a quote form",
    urgent: true,
  },
  {
    name: "Alicia Moreno",
    service: "Shower tile replacement",
    message: "Cracked tiles and grout in our shower. Looking for a quote on redoing the walls.",
    phone: "(737) 555-0171",
    email: "alicia.m@example.com",
    address: "1800 Congress Ave, Austin, TX 78701",
    source: "Contact form",
  },
];

export const statusLabel: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Replied",
  booked: "Booked",
};

export function timeAgo(minutes: number) {
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) {
    const h = Math.floor(minutes / 60);
    return `${h} hr ago`;
  }
  if (minutes < 60 * 48) return "Yesterday";
  return `${Math.floor(minutes / (60 * 24))} days ago`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function firstName(name: string) {
  return name.split(" ")[0] ?? name;
}
