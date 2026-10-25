"use client";

import { useState, type ReactNode } from "react";
import { LogIn, LogOut, ListChecks, Search, UserPlus, Zap, type LucideIcon } from "lucide-react";
import { initials, statusLabel, timeAgo, type Lead, type LeadNote, type LeadStatus } from "@/lib/data";
import { useAccount } from "@/lib/account";
import { browserClient } from "@/lib/supabase/client";
import { LeadDetail, type ContactMethod } from "./LeadSheet";
import type { TestTarget } from "@/lib/contact";
import { Avatar, Mascot, Segmented } from "./ui";
import { ClaimTag, WaitPill } from "./Claim";

// The dashboard layout for PCs and tablets: a sidebar on the left, the page on the right.
// It shows the same screens as the phone app, plus a two-pane Leads page.

export function DesktopShell<T extends string>({
  nav,
  tab,
  onTab,
  newCount,
  children,
}: {
  nav: { id: T; label: string; Icon: LucideIcon }[];
  tab: T;
  onTab: (t: T) => void;
  newCount: number;
  children: ReactNode;
}) {
  const account = useAccount();
  const signOut = async () => {
    await browserClient().auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="desk">
      <aside className="desk-side">
        <a href={account.live ? "/app" : "/"} className="desk-brand" aria-label="My Office Bot">
          <Mascot size={40} />
          <span className="wordmark">
            My <span className="wordmark-blue">Office</span> Bot
          </span>
        </a>

        <nav className="desk-nav" aria-label="Main">
          {nav.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`desk-link${tab === id ? " is-active" : ""}`}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => onTab(id)}
            >
              <Icon size={22} strokeWidth={tab === id ? 2.5 : 2.1} />
              <span>{label}</span>
              {id === "leads" && newCount > 0 && <span className="desk-badge">{newCount}</span>}
            </button>
          ))}
        </nav>

        <div className="desk-account">
          <span className="logo-tile small">{initials(account.name)}</span>
          <div className="desk-account-text">
            <p className="truncate">{account.name}</p>
            <p className="muted truncate">{account.live ? account.ownerEmail : "Demo business"}</p>
          </div>
        </div>
        {account.live ? (
          <button className="desk-link" onClick={signOut}>
            <LogOut size={20} strokeWidth={2.1} /> <span>Sign out</span>
          </button>
        ) : (
          <>
            <a className="desk-link" href="/signup">
              <UserPlus size={20} strokeWidth={2.1} /> <span>Create your account</span>
            </a>
            <a className="desk-link" href="/login">
              <LogIn size={20} strokeWidth={2.1} /> <span>Sign in</span>
            </a>
            <a className="desk-link" href="/features">
              <ListChecks size={20} strokeWidth={2.1} /> <span>What it does</span>
            </a>
          </>
        )}
      </aside>

      {children}
    </div>
  );
}

export function DeskPage({ children }: { children: ReactNode }) {
  return (
    <main className="desk-main">
      <div className="desk-page">{children}</div>
    </main>
  );
}

// ---------------------------------------------------------------- Leads: list on the left, the lead on the right

type Filter = "all" | LeadStatus;

export function LeadsDesk({
  leads,
  selectedId,
  onSelect,
  test,
  onContact,
  onStatus,
  onSchedule,
  onAddNote,
  onDeleteNote,
  onEditReplies,
  replyFocus,
  onRepliesShown,
}: {
  leads: Lead[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  test: TestTarget;
  onContact: (lead: Lead, how: ContactMethod, text?: string) => void;
  onStatus: (lead: Lead, status: LeadStatus) => void;
  onSchedule: (lead: Lead) => void;
  onAddNote: (lead: Lead, text: string) => Promise<boolean>;
  onDeleteNote: (lead: Lead, note: LeadNote) => void;
  onEditReplies: () => void;
  replyFocus?: string | null;
  onRepliesShown?: () => void;
}) {
  const account = useAccount();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const count = (s: LeadStatus) => leads.filter((l) => l.status === s).length;
  const q = query.trim().toLowerCase();
  const list = leads.filter(
    (l) =>
      (filter === "all" || l.status === filter) &&
      (!q || [l.name, l.service, l.phone, l.email, l.address, l.message].some((v) => v.toLowerCase().includes(q))),
  );
  const selected = leads.find((l) => l.id === selectedId) ?? null;
  const waiting = count("new");

  return (
    <main className="desk-main desk-split">
      <section className="desk-list" aria-label="Leads">
        <header className="desk-head">
          <div>
            <h1 className="desk-title">Leads</h1>
            <p className="muted">{account.name}</p>
          </div>
          {waiting > 0 && (
            <span className="desk-waiting">
              <Zap size={16} strokeWidth={2.6} /> {waiting} waiting on you
            </span>
          )}
        </header>
        <label className="desk-search">
          <Search size={20} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, address…" />
        </label>
        <Segmented
          label="Filter leads"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: leads.length },
            { value: "new", label: "New", count: count("new") },
            { value: "contacted", label: "Replied", count: count("contacted") },
            { value: "booked", label: "Booked", count: count("booked") },
          ]}
        />
        <ul className="desk-rows">
          {list.map((l) => (
            <li key={l.id}>
              <button
                className={`desk-row${l.id === selectedId ? " is-active" : ""}`}
                aria-current={l.id === selectedId ? "true" : undefined}
                onClick={() => onSelect(l.id)}
              >
                <Avatar name={l.name} size={44} />
                <span className="desk-row-text">
                  <span className="desk-row-top">
                    <b className="truncate">{l.name}</b>
                    <span className="muted">{timeAgo(l.minutesAgo)}</span>
                  </span>
                  <span className="lead-service truncate">{l.service}</span>
                  <span className="desk-row-tags">
                    <span className={`pill status-${l.status}`}>{statusLabel[l.status]}</span>
                    {l.urgent && l.status === "new" && <span className="pill pill-urgent">Urgent</span>}
                    <WaitPill lead={l} />
                    <ClaimTag lead={l} />
                  </span>
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && <p className="empty">{leads.length ? "No leads match." : "No leads yet. They'll show up here the moment your form sends one."}</p>}
        </ul>
      </section>

      <section className="desk-detail" aria-label="Lead details">
        {selected ? (
          <div className="desk-detail-inner">
            <LeadDetail
              lead={selected}
              test={test}
              onContact={onContact}
              onStatus={onStatus}
              onSchedule={onSchedule}
              onAddNote={onAddNote}
              onDeleteNote={onDeleteNote}
              onEditReplies={onEditReplies}
              focusReplies={!!replyFocus && replyFocus === selected.id}
              onRepliesShown={onRepliesShown}
            />
          </div>
        ) : (
          <div className="desk-empty">
            <Mascot size={96} />
            <p className="card-lead">Pick a lead to see the details</p>
            <p className="muted">Call, text, email, or book a visit from here.</p>
          </div>
        )}
      </section>
    </main>
  );
}
