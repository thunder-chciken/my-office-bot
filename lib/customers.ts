import type { Lead } from "./data";

// Customers (D53): every homeowner from a lead, matched by phone or email, plus ones added by hand.

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  source: "lead" | "manual";
  createdMinutesAgo: number;
  leadIds: string[];
};

const phoneKey = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};

/** Demo only: group the sample leads into customers the same way the database does. */
export function customersFromLeads(leads: Lead[]): Customer[] {
  const out: Customer[] = [];
  for (const l of [...leads].sort((a, b) => b.minutesAgo - a.minutesAgo)) {
    const pk = phoneKey(l.phone);
    const ek = l.email.trim().toLowerCase();
    const found = out.find((c) => (pk && phoneKey(c.phone) === pk) || (ek && c.email.toLowerCase() === ek));
    if (found) found.leadIds.push(l.id);
    else
      out.push({
        id: `cu-${l.id}`,
        name: l.name,
        phone: l.phone,
        email: l.email,
        address: l.address,
        notes: "",
        source: "lead",
        createdMinutesAgo: l.minutesAgo,
        leadIds: [l.id],
      });
  }
  return out;
}

/** Demo only: add a new sample lead to its customer, or start a new one. */
export function attachLead(customers: Customer[], l: Lead): Customer[] {
  const pk = phoneKey(l.phone);
  const ek = l.email.trim().toLowerCase();
  const i = customers.findIndex((c) => (pk && phoneKey(c.phone) === pk) || (ek && c.email.toLowerCase() === ek));
  if (i >= 0) return customers.map((c, j) => (j === i ? { ...c, leadIds: [l.id, ...c.leadIds] } : c));
  return [...customersFromLeads([l]), ...customers];
}

export function blankCustomer(): Customer {
  return { id: "", name: "", phone: "", email: "", address: "", notes: "", source: "manual", createdMinutesAgo: 0, leadIds: [] };
}

export const byName = (a: Customer, b: Customer) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
