"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, Mail, MessageSquare, Pencil, Phone, Trash2, UserPlus } from "lucide-react";
import type { Channel, Contact, Rules } from "@/lib/data";
import { useAccount } from "@/lib/account";
import { SELF_TEXT_CONSENT } from "@/lib/consent";
import { Avatar, Header, SectionTitle, Segmented, Sheet, Toggle } from "./ui";

const channelMeta: { key: Channel; label: string; Icon: typeof Phone }[] = [
  { key: "sms", label: "Text", Icon: MessageSquare },
  { key: "email", label: "Email", Icon: Mail },
  { key: "call", label: "Call", Icon: Phone },
];

// In a real account only email alerts are live during the beta; texts and calls come with Twilio.
function ChannelPicker({
  value,
  onChange,
  textAfterSave = false,
}: {
  value: Record<Channel, boolean>;
  onChange: (v: Record<Channel, boolean>) => void;
  textAfterSave?: boolean;
}) {
  const { live } = useAccount();
  return (
    <div className="chan-row">
      {channelMeta.map(({ key, label, Icon }) => {
        const soon = live && (key === "call" || (key === "sms" && textAfterSave));
        return (
          <button
            key={key}
            className="chan"
            aria-pressed={soon ? false : value[key]}
            disabled={soon}
            title={soon ? "Coming soon" : undefined}
            onClick={() => onChange({ ...value, [key]: !value[key] })}
          >
            <Icon size={24} strokeWidth={2.4} />
            {label}
            {soon && <span className="chan-soon">{key === "sms" ? "After save" : "Soon"}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function AlertsScreen({
  contacts,
  onAdd,
  onUpdate,
  onRemove,
  onTextOn,
  onTextOff,
  rules,
  setRules,
  onTest,
}: {
  contacts: Contact[];
  onAdd: (c: Contact) => Promise<boolean>;
  onUpdate: (c: Contact) => Promise<boolean>;
  onRemove: (c: Contact) => void;
  onTextOn: (c: Contact, self: boolean) => Promise<boolean>;
  onTextOff: (c: Contact) => Promise<void>;
  rules: Rules;
  setRules: (r: Rules) => void;
  onTest: () => void;
}) {
  const account = useAccount();
  const { live } = account;
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [texting, setTexting] = useState<Contact | null>(null);
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
                    {c.name} {c.role && <span className="pill">{c.role}</span>}
                  </p>
                  {live && c.sms === "pending" && <p className="sms-note">Text alerts: waiting for them to reply YES</p>}
                  {live && c.sms === "opted_out" && <p className="sms-note is-warn">Replied STOP to texts. They can text START to turn them back on.</p>}
                  <p className="muted truncate">{live ? c.email || c.phone || "No email yet" : c.phone}</p>
                </div>
                <button className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                  <Pencil size={21} />
                </button>
                <button className="icon-btn" aria-label={`Remove ${c.name}`} onClick={() => onRemove(c)}>
                  <Trash2 size={22} />
                </button>
              </div>
              <ChannelPicker
                value={c.channels}
                onChange={(channels) => {
                  if (live && channels.sms !== c.channels.sms) {
                    if (channels.sms) setTexting(c);
                    else void onTextOff(c);
                    return;
                  }
                  if (channels.email && !c.email) return setEditing({ ...c, channels });
                  void onUpdate({ ...c, channels });
                }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        <button className="btn btn-dashed btn-block" onClick={() => setEditing("new")}>
          <UserPlus size={24} strokeWidth={2.4} /> Add a person
        </button>
      </div>

      {live ? (
        <div className="card pad soon-card">
          {account.smsStatus === "active" ? (
            <>
              <p className="card-lead">Text alerts are on for your business</p>
              <p className="muted">
                Turn on Text for anyone above. You agree for yourself in the app; anyone else gets a text and replies YES.
                A phone call when nobody replies, and night-time rules, are next.
              </p>
            </>
          ) : (
            <>
              <p className="card-lead">Text alerts are waiting on carrier approval</p>
              <p className="muted">
                Email alerts work now. You can turn on Text for people already; texts start the day your business is
                approved. Phone calls and night-time rules come after that.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
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
        </>
      )}

      <button className="btn btn-primary btn-block btn-xl" onClick={onTest}>
        <BellRing size={24} strokeWidth={2.4} /> Send me a test alert
      </button>

      <TextSheet
        person={texting}
        isMe={!!texting && !!texting.email && texting.email.toLowerCase() === account.ownerEmail.toLowerCase()}
        onClose={() => setTexting(null)}
        onEdit={(c) => {
          setTexting(null);
          setEditing(c);
        }}
        onConfirm={async (c, self) => {
          if (await onTextOn(c, self)) setTexting(null);
        }}
      />

      <PersonSheet
        person={editing}
        onClose={() => setEditing(null)}
        onSave={async (c, isNew) => {
          const ok = isNew ? await onAdd(c) : await onUpdate(c);
          if (ok) setEditing(null);
        }}
      />
    </>
  );
}

const roles = ["Owner", "Office", "Crew lead", "Sales"];

function PersonSheet({
  person,
  onClose,
  onSave,
}: {
  person: Contact | "new" | null;
  onClose: () => void;
  onSave: (c: Contact, isNew: boolean) => Promise<void>;
}) {
  return (
    <Sheet open={!!person} onClose={onClose} title={person === "new" ? "Add a person" : "Edit person"}>
      {person && <PersonForm key={person === "new" ? "new" : person.id} person={person} onSave={onSave} />}
    </Sheet>
  );
}

function PersonForm({ person, onSave }: { person: Contact | "new"; onSave: (c: Contact, isNew: boolean) => Promise<void> }) {
  const { live } = useAccount();
  const isNew = person === "new";
  const start = isNew ? null : person;
  const [name, setName] = useState(start?.name ?? "");
  const [role, setRole] = useState(start?.role || "Crew lead");
  const [phone, setPhone] = useState(start?.phone ?? "");
  const [email, setEmail] = useState(start?.email ?? "");
  const [channels, setChannels] = useState<Record<Channel, boolean>>(
    start?.channels ?? (live ? { sms: false, email: true, call: false } : { sms: true, email: false, call: false }),
  );
  const [busy, setBusy] = useState(false);
  const valid = name.trim() && (phone.trim() || email.trim()) && (!channels.email || email.trim());

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    await onSave({ id: start?.id ?? crypto.randomUUID(), name: name.trim(), role, phone: phone.trim(), email: email.trim(), channels }, isNew);
    setBusy(false);
  };

  return (
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
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-0100" inputMode="tel" autoComplete="off" />
      </label>
      <label className="field">
        <span>Email</span>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" inputMode="email" autoComplete="off" />
      </label>
      <div className="field">
        <span>Alert them by</span>
        <ChannelPicker value={channels} onChange={setChannels} textAfterSave={live} />
        {channels.email && !email.trim() && <p className="muted">Add an email address to send alerts there.</p>}
        {live && <p className="muted">Text alerts: save first, then tap Text on their card so they can agree.</p>}
      </div>
      <button className="btn btn-primary btn-block btn-xl" disabled={!valid || busy} onClick={save}>
        {busy ? "Saving…" : "Save person"}
      </button>
    </div>
  );
}

// Turning on text alerts needs consent (SPEC §8): you tick the box for your own number;
// anyone else gets a text and replies YES.
function TextSheet({
  person,
  isMe,
  onClose,
  onEdit,
  onConfirm,
}: {
  person: Contact | null;
  isMe: boolean;
  onClose: () => void;
  onEdit: (c: Contact) => void;
  onConfirm: (c: Contact, self: boolean) => Promise<void>;
}) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async (c: Contact, self: boolean) => {
    setBusy(true);
    await onConfirm(c, self);
    setBusy(false);
    setAgreed(false);
  };

  return (
    <Sheet open={!!person} onClose={onClose} title="Text alerts">
      {person &&
        (!person.phone.trim() ? (
          <div className="form">
            <p className="card-lead">Add {person.name}&apos;s mobile number first</p>
            <button className="btn btn-primary btn-block btn-xl" onClick={() => onEdit(person)}>
              Add a number
            </button>
          </div>
        ) : isMe ? (
          <div className="form">
            <p className="card-lead">Get a text for every new lead at {person.phone}</p>
            <label className="consent-check">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>{SELF_TEXT_CONSENT}</span>
            </label>
            <button className="btn btn-primary btn-block btn-xl" disabled={!agreed || busy} onClick={() => go(person, true)}>
              {busy ? "Turning on…" : "Turn on text alerts"}
            </button>
          </div>
        ) : (
          <div className="form">
            <p className="card-lead">
              We&apos;ll text {person.name} at {person.phone} to confirm
            </p>
            <div className="bubble">
              <p className="bubble-label">They&apos;ll get</p>
              <p className="bubble-text">My Office Bot: [you] at [your business] added you to get new-lead alerts by text. Reply YES to agree or STOP to opt out.</p>
            </div>
            <p className="muted">Their alerts start when they reply YES. Only add people who expect these texts.</p>
            <button className="btn btn-primary btn-block btn-xl" disabled={busy} onClick={() => go(person, false)}>
              {busy ? "Sending…" : `Text ${person.name.split(" ")[0]} to confirm`}
            </button>
          </div>
        ))}
    </Sheet>
  );
}
