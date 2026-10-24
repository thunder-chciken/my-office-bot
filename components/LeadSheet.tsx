"use client";

import { CalendarPlus, Check, Clock, FlaskConical, Mail, MapPin, MessageSquare, Navigation, Phone, Send } from "lucide-react";
import { firstName, quickReplies, statusLabel, timeAgo, type Lead, type LeadStatus } from "@/lib/data";
import { useAccount } from "@/lib/account";
import { mailHref, mapsHref, reach, smsHref, telHref, useIsApple, type TestTarget } from "@/lib/contact";
import { Avatar, Segmented, Sheet } from "./ui";

export type ContactMethod = "call" | "text" | "email" | "directions";

type DetailProps = {
  test: TestTarget;
  onContact: (lead: Lead, how: ContactMethod, text?: string) => void;
  onStatus: (lead: Lead, status: LeadStatus) => void;
  onSchedule: (lead: Lead) => void;
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
export function LeadDetail({ lead, test, onContact, onStatus, onSchedule }: DetailProps & { lead: Lead }) {
  const apple = useIsApple();
  const account = useAccount();
  const to = reach(lead, test);
  const testing = !!(test.phone.trim() || test.email.trim());

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

          <h4 className="sub-title">Quick text to {firstName(lead.name)}</h4>
          <div className="stack-sm">
            {quickReplies.map((r) => (
              <a key={r} className="reply" href={smsHref(to.phone, r)} onClick={() => onContact(lead, "text", r)}>
                <span>{r}</span>
                <Send size={22} strokeWidth={2.4} />
              </a>
            ))}
          </div>

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
