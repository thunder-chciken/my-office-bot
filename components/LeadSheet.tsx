"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Check, Clock, FlaskConical, Mail, MapPin, MessageSquare, Navigation, Phone, Send, X } from "lucide-react";
import { fillReply, firstName, statusLabel, timeAgo, type Lead, type LeadNote, type LeadStatus } from "@/lib/data";
import { repliesFor, useAccount } from "@/lib/account";
import { mailHref, mapsHref, reach, smsHref, telHref, useIsApple, type TestTarget } from "@/lib/contact";
import { Avatar, Segmented, Sheet } from "./ui";
import { SaveContactButton } from "./SaveContact";
import { ClaimBar } from "./Claim";

export type ContactMethod = "call" | "text" | "email" | "directions";

type DetailProps = {
  test: TestTarget;
  onContact: (lead: Lead, how: ContactMethod, text?: string) => void;
  onStatus: (lead: Lead, status: LeadStatus) => void;
  onSchedule: (lead: Lead) => void;
  onAddNote: (lead: Lead, text: string) => Promise<boolean>;
  onDeleteNote: (lead: Lead, note: LeadNote) => void;
  onEditReplies: () => void;
  /** Opened from a notification: scroll to the quick text replies and highlight them (D63). */
  focusReplies?: boolean;
  onRepliesShown?: () => void;
};

export function LeadSheet({ lead, onClose, ...props }: DetailProps & { lead: Lead | null; onClose: () => void }) {
  return (
    <Sheet open={!!lead} onClose={onClose} title="Lead">
      {lead && <LeadDetail lead={lead} {...props} />}
    </Sheet>
  );
}

// The full lead: contact buttons, message, quick replies, status and alert history.
// Shown in a sheet on phones and as the right-hand panel on the desktop dashboard.
export function LeadDetail({
  lead,
  test,
  onContact,
  onStatus,
  onSchedule,
  onAddNote,
  onDeleteNote,
  onEditReplies,
  focusReplies = false,
  onRepliesShown,
}: DetailProps & { lead: Lead }) {
  const apple = useIsApple();
  const account = useAccount();
  const to = reach(lead, test);
  const testing = !!(test.phone.trim() || test.email.trim());
  const replies = repliesFor(account).map((r) => fillReply(r, lead.name));
  const replyRef = useRef<HTMLElement>(null);
  const [glow, setGlow] = useState(false);

  const shown = useRef(onRepliesShown);
  shown.current = onRepliesShown;

  useEffect(() => {
    if (!focusReplies) return;
    // Wait for the sheet to slide up, then bring the replies into view.
    const t = setTimeout(() => {
      // Scroll only the sheet or panel itself; scrollIntoView would also shift the clipped frames around it.
      const el = replyRef.current;
      let box = el?.parentElement ?? null;
      while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement;
      if (el && box) {
        const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 16;
        box.scrollTo({ top, behavior: "smooth" });
      }
      setGlow(true);
      shown.current?.();
    }, 450);
    return () => clearTimeout(t);
  }, [focusReplies]);

  useEffect(() => {
    if (!glow) return;
    const t = setTimeout(() => setGlow(false), 2500);
    return () => clearTimeout(t);
  }, [glow]);

  return (
        <>
          <div className="detail-head">
            <Avatar name={lead.name} size={68} />
            <div>
              <h3 className="detail-name">{lead.name}</h3>
              <p className="lead-service">{lead.service}</p>
              <p className="muted">
                {timeAgo(lead.minutesAgo)} · {lead.source}
              </p>
            </div>
          </div>

          <ClaimBar lead={lead} />

          {testing && (
            <p className="test-note">
              <FlaskConical size={20} strokeWidth={2.4} /> Test mode: calls, texts and emails go to you
            </p>
          )}

          <div className="action-grid">
            <a className="action-tile is-primary" href={telHref(to.phone)} onClick={() => onContact(lead, "call")}>
              <Phone size={28} strokeWidth={2.4} /> Call
            </a>
            <a className="action-tile" href={smsHref(to.phone)} onClick={() => onContact(lead, "text")}>
              <MessageSquare size={28} strokeWidth={2.4} /> Text
            </a>
            <a className="action-tile" href={mailHref(to.email, lead, account)} onClick={() => onContact(lead, "email")}>
              <Mail size={28} strokeWidth={2.4} /> Email
            </a>
            <a
              className="action-tile"
              href={mapsHref(lead.address, apple)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onContact(lead, "directions")}
            >
              <Navigation size={28} strokeWidth={2.4} /> Directions
            </a>
          </div>

          <SaveContactButton
            kind="lead"
            id={lead.id}
            person={{ name: lead.name, phone: lead.phone, email: lead.email, address: lead.address, note: lead.service }}
            className="btn btn-soft btn-block save-contact"
          />

          <div className="bubble">
            <p className="bubble-label">Their message</p>
            <p className="bubble-text">{lead.message}</p>
          </div>

          <ul className="card list">
            <li>
              <a className="row row-link" href={telHref(to.phone)} onClick={() => onContact(lead, "call")}>
                <Phone size={22} className="row-icon" /> {lead.phone}
              </a>
            </li>
            <li>
              <a className="row row-link" href={mailHref(to.email, lead, account)} onClick={() => onContact(lead, "email")}>
                <Mail size={22} className="row-icon" /> <span className="truncate">{lead.email}</span>
              </a>
            </li>
            <li>
              <a
                className="row row-link"
                href={mapsHref(lead.address, apple)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onContact(lead, "directions")}
              >
                <MapPin size={22} className="row-icon" /> {lead.address}
              </a>
            </li>
          </ul>

          <section ref={replyRef} className={`reply-zone${glow ? " is-glow" : ""}`} aria-label={`Quick text to ${firstName(lead.name)}`}>
          <div className="sub-title-row">
            <h4 className="sub-title">Quick text to {firstName(lead.name)}</h4>
            <button className="text-btn" onClick={onEditReplies}>
              Edit replies
            </button>
          </div>
          {replies.length ? (
            <div className="stack-sm">
              {replies.map((r, i) => (
                <a key={i} className="reply" href={smsHref(to.phone, r)} onClick={() => onContact(lead, "text", r)}>
                  <span>{r}</span>
                  <Send size={22} strokeWidth={2.4} />
                </a>
              ))}
            </div>
          ) : (
            <p className="muted">No quick replies yet. Tap Edit replies to write some.</p>
          )}
          </section>

          <LeadNotes key={lead.id} lead={lead} onAdd={onAddNote} onDelete={onDeleteNote} />

          <button className="btn btn-primary btn-block schedule-lead" onClick={() => onSchedule(lead)}>
            <CalendarPlus size={22} strokeWidth={2.5} /> Schedule a visit
          </button>

          <h4 className="sub-title">Status</h4>
          <Segmented
            label="Lead status"
            value={lead.status}
            onChange={(s) => onStatus(lead, s)}
            options={(Object.keys(statusLabel) as LeadStatus[]).map((s) => ({
              value: s,
              label: statusLabel[s],
            }))}
          />

          <h4 className="sub-title">Alert history</h4>
          <ol className="timeline">
            {lead.alerts.map((a, i) => (
              <li key={i}>
                <span className={`tl-dot${a.ok ? " is-ok" : ""}`}>
                  {a.ok ? <Check size={16} strokeWidth={3} /> : <Clock size={16} strokeWidth={3} />}
                </span>
                <span className="tl-text">{a.text}</span>
                <span className="tl-time">{timeAgo(a.minutesAgo)}</span>
              </li>
            ))}
          </ol>
        </>
  );
}

// Quick notes on a lead ("left voicemail", "wants a quote by Friday"). Also shown on the customer.
function LeadNotes({
  lead,
  onAdd,
  onDelete,
}: {
  lead: Lead;
  onAdd: DetailProps["onAddNote"];
  onDelete: DetailProps["onDeleteNote"];
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const notes = lead.notes ?? [];

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const ok = await onAdd(lead, text.trim());
    setBusy(false);
    if (ok) setText("");
  };

  return (
    <>
      <h4 className="sub-title">Notes</h4>
      {notes.length > 0 && (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id} className="note">
              <p className="note-text">{n.text}</p>
              <span className="note-time">{timeAgo(n.minutesAgo)}</span>
              <button className="note-delete" onClick={() => onDelete(lead, n)} aria-label="Delete note">
                <X size={18} strokeWidth={2.6} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="note-add">
        <textarea
          className="beta-textarea"
          rows={2}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Left a voicemail · wants a quote by Friday…"
          aria-label={`Add a note about ${firstName(lead.name)}`}
        />
        <button className="btn btn-soft" disabled={!text.trim() || busy} onClick={add}>
          {busy ? "Saving…" : "Add note"}
        </button>
      </div>
    </>
  );
}
