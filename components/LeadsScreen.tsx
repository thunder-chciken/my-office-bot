"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MessageSquare, Phone, Zap } from "lucide-react";
import { business, timeAgo, type Lead, type LeadStatus } from "@/lib/data";
import { reach, smsHref, telHref, type TestTarget } from "@/lib/contact";
import { Avatar, Header, Mascot, Segmented } from "./ui";

export function LeadsScreen({
  leads,
  test,
  onOpen,
  onContact,
}: {
  leads: Lead[];
  test: TestTarget;
  onOpen: (id: string) => void;
  onContact: (lead: Lead, how: "call" | "text") => void;
}) {
  const [filter, setFilter] = useState<LeadStatus>("new");
  const count = (s: LeadStatus) => leads.filter((l) => l.status === s).length;
  const waiting = leads.filter((l) => l.status === "new");
  const oldest = Math.max(0, ...waiting.map((l) => l.minutesAgo));
  const list = leads.filter((l) => l.status === filter);

  return (
    <>
      <Header title="Leads" subtitle={business.name} />

      {waiting.length > 0 ? (
        <div className="hero">
          <div className="hero-row">
            <span className="hero-num">{waiting.length}</span>
            <span className="hero-label">
              new {waiting.length === 1 ? "lead" : "leads"}
              <br />
              waiting on you
            </span>
          </div>
          <p className="hero-sub">
            <Zap size={18} strokeWidth={2.5} /> Oldest has waited {timeAgo(oldest).replace(" ago", "")}.
            Fast replies win the job.
          </p>
        </div>
      ) : (
        <div className="hero hero-calm">
          <Mascot size={72} />
          <div>
            <p className="hero-calm-title">You&apos;re all caught up</p>
            <p className="hero-sub">We&apos;ll text you the second a new one comes in.</p>
          </div>
        </div>
      )}

      <Segmented
        label="Filter leads"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "new", label: "New", count: count("new") },
          { value: "contacted", label: "Replied", count: count("contacted") },
          { value: "booked", label: "Booked", count: count("booked") },
        ]}
      />

      <div className="stack">
        <AnimatePresence initial={false} mode="popLayout">
          {list.map((lead) => (
            <motion.article
              key={lead.id}
              layout
              className="lead-card"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            >
              <button className="lead-open" onClick={() => onOpen(lead.id)}>
                <div className="lead-top">
                  <Avatar name={lead.name} />
                  <div className="lead-id">
                    <h3 className="lead-name">{lead.name}</h3>
                    <p className="lead-service">{lead.service}</p>
                  </div>
                  <span className="lead-time">{timeAgo(lead.minutesAgo)}</span>
                </div>
                {lead.urgent && lead.status === "new" && <span className="pill pill-urgent">Urgent</span>}
                <p className="lead-msg">{lead.message}</p>
              </button>
              <div className="btn-row">
                <a
                  className="btn btn-primary"
                  href={telHref(reach(lead, test).phone)}
                  onClick={() => onContact(lead, "call")}
                >
                  <Phone size={22} strokeWidth={2.5} /> Call
                </a>
                <a
                  className="btn btn-soft"
                  href={smsHref(reach(lead, test).phone)}
                  onClick={() => onContact(lead, "text")}
                >
                  <MessageSquare size={22} strokeWidth={2.5} /> Text
                </a>
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
        {list.length === 0 && (
          <p className="empty">
            {filter === "new" ? "No new leads right now." : `Nothing ${filter === "booked" ? "booked" : "replied to"} yet.`}
          </p>
        )}
      </div>
    </>
  );
}
