"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Mail, MapPin, MessageSquare, Navigation, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { statusLabel, timeAgo, type Lead } from "@/lib/data";
import { mapsHref, smsHref, telHref, useIsApple, type TestTarget } from "@/lib/contact";
import { blankCustomer, byName, type Customer } from "@/lib/customers";
import { SaveContactButton } from "./SaveContact";
import { Avatar, Header, Sheet } from "./ui";

// Customers (D53): every homeowner from a lead plus ones added by hand, with their lead history.

export function CustomersScreen({
  customers,
  leads,
  onOpen,
  onAdd,
}: {
  customers: Customer[];
  leads: Lead[];
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const list = customers
    .filter(
      (c) =>
        !q ||
        [c.name, c.email, c.address, c.notes].some((v) => v.toLowerCase().includes(q)) ||
        (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)),
    )
    .sort(byName);
  const lastLead = (c: Customer) =>
    leads.filter((l) => c.leadIds.includes(l.id)).sort((a, b) => a.minutesAgo - b.minutesAgo)[0];

  return (
    <>
      <Header
        title="Customers"
        subtitle={`${customers.length} saved`}
        action={
          <button className="round-btn" onClick={onAdd} aria-label="Add a customer">
            <Plus size={30} strokeWidth={2.6} />
          </button>
        }
      />

      <label className="desk-search cust-search">
        <Search size={20} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, address…" />
      </label>

      <div className="stack">
        <AnimatePresence initial={false} mode="popLayout">
          {list.map((c) => {
            const last = lastLead(c);
            return (
              <motion.button
                key={c.id}
                layout
                className="cust-row"
                onClick={() => onOpen(c.id)}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              >
                <Avatar name={c.name} size={48} />
                <span className="cust-text">
                  <b className="truncate">{c.name}</b>
                  <span className="muted truncate">{c.phone || c.email || c.address || "No contact details"}</span>
                  <span className="cust-meta">
                    {last ? `${last.service} · ${timeAgo(last.minutesAgo)}` : c.source === "manual" ? "Added by you" : "No leads yet"}
                  </span>
                </span>
                <ChevronRight size={22} className="chev" />
              </motion.button>
            );
          })}
        </AnimatePresence>
        {list.length === 0 && (
          <p className="empty">
            {customers.length ? "No customers match." : "Customers show up here automatically when a website lead comes in."}
          </p>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- one customer

export function CustomerSheet({
  customer,
  leads,
  test,
  onClose,
  onEdit,
  onDelete,
  onOpenLead,
}: {
  customer: Customer | null;
  leads: Lead[];
  test: TestTarget;
  onClose: () => void;
  onEdit: (c: Customer) => void;
  onDelete: (c: Customer) => void;
  onOpenLead: (id: string) => void;
}) {
  const apple = useIsApple();
  const [armed, setArmed] = useState(false);
  const c = customer;
  const phone = test.phone.trim() || c?.phone || "";
  const email = test.email.trim() || c?.email || "";
  const history = c ? leads.filter((l) => c.leadIds.includes(l.id)).sort((a, b) => a.minutesAgo - b.minutesAgo) : [];

  return (
    <Sheet
      open={!!c}
      onClose={() => {
        setArmed(false);
        onClose();
      }}
      title="Customer"
    >
      {c && (
        <>
          <div className="detail-head">
            <Avatar name={c.name} size={68} />
            <div>
              <h3 className="detail-name">{c.name}</h3>
              <p className="muted">{c.source === "manual" ? "Added by you" : `Customer since ${timeAgo(c.createdMinutesAgo).toLowerCase()}`}</p>
            </div>
          </div>

          <div className="action-grid">
            <a className={`action-tile is-primary${phone ? "" : " is-disabled"}`} href={phone ? telHref(phone) : undefined}>
              <Phone size={28} strokeWidth={2.4} /> Call
            </a>
            <a className={`action-tile${phone ? "" : " is-disabled"}`} href={phone ? smsHref(phone) : undefined}>
              <MessageSquare size={28} strokeWidth={2.4} /> Text
            </a>
            <a className={`action-tile${email ? "" : " is-disabled"}`} href={email ? `mailto:${email}` : undefined}>
              <Mail size={28} strokeWidth={2.4} /> Email
            </a>
            <a
              className={`action-tile${c.address ? "" : " is-disabled"}`}
              href={c.address ? mapsHref(c.address, apple) : undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Navigation size={28} strokeWidth={2.4} /> Directions
            </a>
          </div>

          <SaveContactButton
            kind="customer"
            id={c.id}
            person={{ name: c.name, phone: c.phone, email: c.email, address: c.address, note: c.notes }}
            className="btn btn-soft btn-block save-contact"
          />

          <ul className="card list">
            <li className="row">
              <Phone size={22} className="row-icon" /> {c.phone || <span className="muted">No phone</span>}
            </li>
            <li className="row">
              <Mail size={22} className="row-icon" /> <span className="truncate">{c.email || <span className="muted">No email</span>}</span>
            </li>
            <li className="row">
              <MapPin size={22} className="row-icon" /> {c.address || <span className="muted">No address</span>}
            </li>
          </ul>

          {c.notes && (
            <div className="bubble">
              <p className="bubble-label">Notes</p>
              <p className="bubble-text">{c.notes}</p>
            </div>
          )}

          <h4 className="sub-title">Leads</h4>
          {history.length ? (
            <ul className="card list">
              {history.map((l) => (
                <li key={l.id}>
                  <button className="row row-btn" onClick={() => onOpenLead(l.id)}>
                    <span className="row-text">
                      <span>{l.service}</span>
                      <span className="muted">{timeAgo(l.minutesAgo)}</span>
                    </span>
                    <span className={`pill status-${l.status}`}>{statusLabel[l.status]}</span>
                    <ChevronRight size={22} className="chev" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No website leads from this customer yet.</p>
          )}

          <div className="stack-sm sheet-actions">
            <button className="btn btn-soft btn-block" onClick={() => onEdit(c)}>
              <Pencil size={20} strokeWidth={2.5} /> Edit customer
            </button>
            <button
              className={`btn btn-block btn-danger${armed ? " is-armed" : ""}`}
              onClick={() => {
                if (!armed) return setArmed(true);
                setArmed(false);
                onDelete(c);
              }}
            >
              <Trash2 size={20} strokeWidth={2.5} /> {armed ? "Tap again to delete" : "Delete customer"}
            </button>
            {armed && <p className="muted center-note">Their leads stay in your Leads list.</p>}
          </div>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- add / edit

export function CustomerEditSheet({
  customer,
  onClose,
  onSave,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSave: (c: Customer) => Promise<boolean>;
}) {
  return (
    <Sheet open={!!customer} onClose={onClose} title={customer?.id ? "Edit customer" : "Add a customer"}>
      {customer && <CustomerForm key={customer.id || "new"} customer={customer} onSave={onSave} />}
    </Sheet>
  );
}

function CustomerForm({ customer, onSave }: { customer: Customer; onSave: (c: Customer) => Promise<boolean> }) {
  const [draft, setDraft] = useState(customer);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Customer>) => setDraft((d) => ({ ...d, ...patch }));
  const valid = draft.name.trim().length > 0;

  return (
    <div className="form">
      <label className="field">
        <span>Name</span>
        <input value={draft.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" placeholder="Full name" />
      </label>
      <label className="field">
        <span>Phone</span>
        <input value={draft.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" autoComplete="off" placeholder="(512) 555-0100" />
      </label>
      <label className="field">
        <span>Email</span>
        <input value={draft.email} onChange={(e) => set({ email: e.target.value })} inputMode="email" autoComplete="off" placeholder="name@example.com" />
      </label>
      <label className="field">
        <span>Address</span>
        <input value={draft.address} onChange={(e) => set({ address: e.target.value })} autoComplete="off" placeholder="Street, city" />
      </label>
      <label className="field">
        <span>Notes</span>
        <textarea
          className="beta-textarea"
          rows={4}
          value={draft.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Gate code, dog in yard, prefers texts…"
        />
      </label>
      <button
        className="btn btn-primary btn-block btn-xl"
        disabled={!valid || busy}
        onClick={async () => {
          setBusy(true);
          await onSave({ ...draft, name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim(), address: draft.address.trim(), notes: draft.notes.trim() });
          setBusy(false);
        }}
      >
        {busy ? "Saving…" : "Save customer"}
      </button>
    </div>
  );
}

export { blankCustomer };
