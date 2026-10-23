"use client";

import { Check, Clock, Mail, MapPin, MessageSquare, Navigation, Phone, Send } from "lucide-react";
import { firstName, quickReplies, statusLabel, timeAgo, type Lead, type LeadStatus } from "@/lib/data";
import { Avatar, Segmented, Sheet } from "./ui";

export type ContactMethod = "call" | "text" | "email" | "directions";

export function LeadSheet({
  lead,
  onClose,
  onContact,
  onStatus,
}: {
  lead: Lead | null;
  onClose: () => void;
  onContact: (lead: Lead, how: ContactMethod, text?: string) => void;
  onStatus: (lead: Lead, status: LeadStatus) => void;
}) {
  return (
    <Sheet open={!!lead} onClose={onClose} title="Lead">
      {lead && (
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

          <div className="action-grid">
            <button className="action-tile is-primary" onClick={() => onContact(lead, "call")}>
              <Phone size={28} strokeWidth={2.4} /> Call
            </button>
            <button className="action-tile" onClick={() => onContact(lead, "text")}>
              <MessageSquare size={28} strokeWidth={2.4} /> Text
            </button>
            <button className="action-tile" onClick={() => onContact(lead, "email")}>
              <Mail size={28} strokeWidth={2.4} /> Email
            </button>
            <button className="action-tile" onClick={() => onContact(lead, "directions")}>
              <Navigation size={28} strokeWidth={2.4} /> Directions
            </button>
          </div>

          <div className="bubble">
            <p className="bubble-label">Their message</p>
            <p className="bubble-text">{lead.message}</p>
          </div>

          <ul className="card list">
            <li className="row">
              <Phone size={22} className="row-icon" /> {lead.phone}
            </li>
            <li className="row">
              <Mail size={22} className="row-icon" /> <span className="truncate">{lead.email}</span>
            </li>
            <li className="row">
              <MapPin size={22} className="row-icon" /> {lead.address}
            </li>
          </ul>

          <h4 className="sub-title">Quick text to {firstName(lead.name)}</h4>
          <div className="stack-sm">
            {quickReplies.map((r) => (
              <button key={r} className="reply" onClick={() => onContact(lead, "text", r)}>
                <span>{r}</span>
                <Send size={22} strokeWidth={2.4} />
              </button>
            ))}
          </div>

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
      )}
    </Sheet>
  );
}
