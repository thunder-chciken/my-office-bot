"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, Mail, MessageSquare, Phone, Trash2, UserPlus } from "lucide-react";
import type { Channel, Contact, Rules } from "@/lib/data";
import { Avatar, Header, SectionTitle, Segmented, Sheet, Toggle } from "./ui";

const channelMeta: { key: Channel; label: string; Icon: typeof Phone }[] = [
  { key: "sms", label: "Text", Icon: MessageSquare },
  { key: "email", label: "Email", Icon: Mail },
  { key: "call", label: "Call", Icon: Phone },
];

function ChannelPicker({
  value,
  onChange,
}: {
  value: Record<Channel, boolean>;
  onChange: (v: Record<Channel, boolean>) => void;
}) {
  return (
    <div className="chan-row">
      {channelMeta.map(({ key, label, Icon }) => (
        <button
          key={key}
          className="chan"
          aria-pressed={value[key]}
          onClick={() => onChange({ ...value, [key]: !value[key] })}
        >
          <Icon size={24} strokeWidth={2.4} />
          {label}
        </button>
      ))}
    </div>
  );
}

export function AlertsScreen({
  contacts,
  setContacts,
  rules,
  setRules,
  onTest,
}: {
  contacts: Contact[];
  setContacts: (c: Contact[]) => void;
  rules: Rules;
  setRules: (r: Rules) => void;
  onTest: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const update = (id: string, patch: Partial<Contact>) =>
    setContacts(contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const callTargets = contacts.filter((c) => c.channels.call).map((c) => c.name);

  return (
    <>
      <Header title="Alerts" subtitle="Who hears about new leads, and how" />

      <SectionTitle>People</SectionTitle>
      <div className="stack">
        <AnimatePresence initial={false} mode="popLayout">
          {contacts.map((c) => (
            <motion.div
              key={c.id}
              layout
              className="card contact-card"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            >
              <div className="contact-top">
                <Avatar name={c.name} size={48} />
                <div className="lead-id">
                  <p className="contact-name">
                    {c.name} <span className="pill">{c.role}</span>
                  </p>
                  <p className="muted">{c.phone}</p>
                </div>
                <button
                  className="icon-btn"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => setContacts(contacts.filter((x) => x.id !== c.id))}
                >
                  <Trash2 size={22} />
                </button>
              </div>
              <ChannelPicker value={c.channels} onChange={(channels) => update(c.id, { channels })} />
            </motion.div>
          ))}
        </AnimatePresence>
        <button className="btn btn-dashed btn-block" onClick={() => setAdding(true)}>
          <UserPlus size={24} strokeWidth={2.4} /> Add a person
        </button>
      </div>

      <SectionTitle>If nobody replies</SectionTitle>
      <div className="card pad">
        <p className="card-lead">
          Phone call to {callTargets.length ? callTargets.join(" & ") : "no one yet"} after
        </p>
        <Segmented
          label="Call if no reply after"
          value={rules.callAfterMinutes}
          onChange={(v) => setRules({ ...rules, callAfterMinutes: v })}
          options={[
            { value: 0, label: "Off" },
            { value: 5, label: "5 min" },
            { value: 10, label: "10 min" },
            { value: 15, label: "15 min" },
          ]}
        />
      </div>

      <SectionTitle>Nights &amp; weekends</SectionTitle>
      <ul className="card list">
        <li className="row row-tall">
          <div className="row-text">
            <p>Alert me after hours</p>
            <p className="muted">Turn off to wait until 7am</p>
          </div>
          <Toggle
            label="Alert me after hours"
            checked={rules.afterHours}
            onChange={(v) => setRules({ ...rules, afterHours: v })}
          />
        </li>
        <li className="row row-tall">
          <div className="row-text">
            <p>Always call for emergencies</p>
            <p className="muted">Words like leak, flooding, no heat</p>
          </div>
          <Toggle
            label="Always call for emergencies"
            checked={rules.emergencyCall}
            onChange={(v) => setRules({ ...rules, emergencyCall: v })}
          />
        </li>
      </ul>

      <button className="btn btn-primary btn-block btn-xl" onClick={onTest}>
        <BellRing size={24} strokeWidth={2.4} /> Send me a test alert
      </button>

      <AddPersonSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSave={(c) => {
          setContacts([...contacts, c]);
          setAdding(false);
        }}
      />
    </>
  );
}

const roles = ["Owner", "Office", "Crew lead", "Sales"];

function AddPersonSheet({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (c: Contact) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Crew lead");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channels, setChannels] = useState<Record<Channel, boolean>>({ sms: true, email: false, call: false });
  const valid = name.trim() && (phone.trim() || email.trim());

  const save = () => {
    if (!valid) return;
    onSave({ id: crypto.randomUUID(), name: name.trim(), role, phone, email, channels });
    setName("");
    setPhone("");
    setEmail("");
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add a person">
      <div className="form">
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" autoComplete="off" />
        </label>
        <div className="field">
          <span>Role</span>
          <div className="chip-row">
            {roles.map((r) => (
              <button key={r} className="chip" aria-pressed={role === r} onClick={() => setRole(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Mobile number</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 555-0100"
            inputMode="tel"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            inputMode="email"
            autoComplete="off"
          />
        </label>
        <div className="field">
          <span>Alert them by</span>
          <ChannelPicker value={channels} onChange={setChannels} />
        </div>
        <button className="btn btn-primary btn-block btn-xl" disabled={!valid} onClick={save}>
          Save person
        </button>
      </div>
    </Sheet>
  );
}
