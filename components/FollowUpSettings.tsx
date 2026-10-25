"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { Account } from "@/lib/account";
import { useAccount } from "@/lib/account";
import type { Contact } from "@/lib/data";
import { CONFIRM_MAX_BODY, CONFIRM_MAX_SUBJECT, defaultConfirmBody, defaultConfirmSubject, fillConfirm } from "@/lib/confirm";
import { Segmented, Toggle } from "./ui";

// Alerts screen settings from council R&D 013 (D64): the second reminder when nobody's on a lead,
// and the homeowner's instant "we got your request" email.

const reminderOptions = [
  { value: 0, label: "Off" },
  { value: 5, label: "5m" },
  { value: 10, label: "10m" },
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 60, label: "1 hr" },
];

export function ReminderCard({ onSave }: { onSave: (minutes: number) => Promise<boolean> }) {
  const { remindAfter } = useAccount();
  return (
    <div className="card pad">
      <p className="card-lead">Remind everyone if nobody&apos;s on a lead after</p>
      <Segmented label="Second reminder after" value={remindAfter} onChange={(v) => void onSave(v)} options={reminderOptions} />
      <p className="muted followup-note">
        {remindAfter
          ? `If nobody taps I'm on it or replies within ${remindAfter === 60 ? "an hour" : `${remindAfter} minutes`}, everyone gets a second phone notification and email. Overnight (9pm–7am) it waits for morning, unless the lead is urgent.`
          : "Off: only the first alert goes out."}
      </p>
    </div>
  );
}

export function ConfirmEmailCard({
  contacts,
  onSave,
}: {
  contacts: Contact[];
  onSave: (c: Account["confirmEmail"]) => Promise<boolean>;
}) {
  const account = useAccount();
  const saved = account.confirmEmail;
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(saved.subject ?? defaultConfirmSubject);
  const [body, setBody] = useState(saved.body ?? defaultConfirmBody);
  const [replyTo, setReplyTo] = useState(saved.replyTo ?? "");
  const [busy, setBusy] = useState(false);

  const fallback = contacts.find((p) => p.channels.email && p.email)?.email || account.ownerEmail;
  const sample = { name: "Dana Whitfield", business: account.name, service: "roof leak repair", phone: account.phone };
  const shownSubject = editing ? subject : (saved.subject ?? defaultConfirmSubject);
  const shownBody = editing ? body : (saved.body ?? defaultConfirmBody);
  const valid = subject.trim() && body.trim() && (!replyTo.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(replyTo.trim()));

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    const ok = await onSave({
      on: saved.on,
      // Unchanged built-in wording stays "built-in", so later improvements reach it.
      subject: subject.trim() === defaultConfirmSubject ? null : subject.trim(),
      body: body.trim() === defaultConfirmBody ? null : body.trim(),
      replyTo: replyTo.trim() || null,
    });
    setBusy(false);
    if (ok) setEditing(false);
  };

  return (
    <div className="card pad confirm-card">
      <div className="confirm-top">
        <p className="card-lead">Email homeowners right away</p>
        <Toggle label="Email homeowners right away" checked={saved.on} onChange={(on) => void onSave({ ...saved, on })} />
      </div>
      <p className="muted">
        A &ldquo;we got your request&rdquo; email the second a lead comes in, in your words. Only sent when they leave an email.
      </p>

      <div className="bubble confirm-preview">
        <p className="bubble-label">They&apos;ll get, from {account.name || "your business"}</p>
        <p className="confirm-subject">{fillConfirm(shownSubject, sample)}</p>
        <p className="bubble-text confirm-body">{fillConfirm(shownBody, sample)}</p>
      </div>

      {editing ? (
        <div className="form">
          <label className="field">
            <span>Subject</span>
            <input value={subject} maxLength={CONFIRM_MAX_SUBJECT} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="field">
            <span>Email</span>
            <textarea className="beta-textarea" rows={10} maxLength={CONFIRM_MAX_BODY} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <p className="muted">
            Fill-ins: <code>{"{name}"}</code> their first name, <code>{"{business}"}</code>, <code>{"{service}"}</code> what they asked for,{" "}
            <code>{"{phone}"}</code> your number.
          </p>
          <label className="field">
            <span>Replies go to</span>
            <input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder={fallback} inputMode="email" autoComplete="off" />
          </label>
          <button className="btn btn-primary btn-block btn-xl" disabled={!valid || busy} onClick={save}>
            {busy ? "Saving…" : "Save email"}
          </button>
          <div className="btn-row">
            <button
              className="btn btn-soft"
              onClick={() => {
                setSubject(defaultConfirmSubject);
                setBody(defaultConfirmBody);
              }}
            >
              Reset
            </button>
            <button
              className="btn btn-soft"
              onClick={() => {
                setSubject(saved.subject ?? defaultConfirmSubject);
                setBody(saved.body ?? defaultConfirmBody);
                setReplyTo(saved.replyTo ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button className="btn btn-soft btn-block" onClick={() => setEditing(true)}>
            <Pencil size={20} strokeWidth={2.4} /> Edit the email
          </button>
          <p className="muted followup-note">When they reply, it goes to {saved.replyTo || fallback || "you"}.</p>
        </>
      )}
    </div>
  );
}
