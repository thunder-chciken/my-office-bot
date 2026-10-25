"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Clock, Hand } from "lucide-react";
import { firstName, timeAgo, type Claim, type Contact, type Lead } from "@/lib/data";

// "I'm on it" and the waiting timers (D64). One tap claims a lead so the team knows who has it; it can be
// handed to someone else or put back. New leads nobody has show how long they've waited: green under
// 5 minutes, yellow under 30, red after that.

export type Me = { userId: string; contactId?: string };

type Claims = {
  me: Me;
  team: Contact[];
  onClaim: (lead: Lead, contactId: string | null, force: boolean) => void;
  onRelease: (lead: Lead) => void;
};

const ClaimContext = createContext<Claims>({ me: { userId: "" }, team: [], onClaim: () => {}, onRelease: () => {} });
export const ClaimProvider = ClaimContext.Provider;
export const useClaims = () => useContext(ClaimContext);

export const isMine = (c: Claim | null | undefined, me: Me) =>
  !!c && ((!!c.userId && c.userId === me.userId) || (!!c.contactId && c.contactId === me.contactId));

/** The time now, refreshed every 30 seconds so timers tick on their own. */
export function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

export const waitingMinutes = (lead: Lead, now: number) =>
  lead.receivedAt ? Math.max(0, Math.floor((now - lead.receivedAt) / 60_000)) : lead.minutesAgo;

const waitLevel = (m: number) => (m < 5 ? "green" : m < 30 ? "yellow" : "red");

function waitLabel(m: number) {
  if (m < 60) return `${Math.max(1, m)} min`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} hr`;
  const d = Math.floor(m / (60 * 24));
  return `${d} ${d === 1 ? "day" : "days"}`;
}

/** "Waiting 12 min", on new leads nobody has claimed yet. */
export function WaitPill({ lead }: { lead: Lead }) {
  const now = useNow();
  if (lead.status !== "new" || lead.claimedBy) return null;
  const m = waitingMinutes(lead, now);
  return (
    <span className={`pill wait-pill is-${waitLevel(m)}`}>
      <Clock size={14} strokeWidth={2.8} /> Waiting {waitLabel(m)}
    </span>
  );
}

/** "Jenna's on it" / "You're on it", on lead cards and rows. */
export function ClaimTag({ lead }: { lead: Lead }) {
  const { me } = useClaims();
  const c = lead.claimedBy;
  if (!c) return null;
  const mine = isMine(c, me);
  return (
    <span className={`pill claim-pill${mine ? " is-mine" : ""}`}>
      <Hand size={14} strokeWidth={2.8} /> {mine ? "You're on it" : `${firstName(c.name)}'s on it`}
    </span>
  );
}

/** The claim strip at the top of a lead: the big "I'm on it" button, or who has it with Take it / Hand off. */
export function ClaimBar({ lead }: { lead: Lead }) {
  const { me, team, onClaim, onRelease } = useClaims();
  const [handing, setHanding] = useState(false);
  const c = lead.claimedBy;
  const mine = isMine(c, me);
  if (!c && lead.status !== "new") return null;

  const handTo = (id: string | null) => {
    setHanding(false);
    if (id) onClaim(lead, id, true);
    else onRelease(lead);
  };
  const others = team.filter((p) => p.id !== c?.contactId);

  return (
    <div className={`claim-bar${c ? (mine ? " is-mine" : " is-theirs") : " is-open"}`}>
      {c ? (
        <div className="claim-row">
          <span className="claim-icon" aria-hidden>
            <Hand size={22} strokeWidth={2.5} />
          </span>
          <div className="claim-text">
            <b>{mine ? "You're on it" : `${c.name} is on it`}</b>
            <span>{c.minutesAgo < 1 ? "Just now" : `Took it ${timeAgo(c.minutesAgo)}`}</span>
          </div>
          <div className="claim-btns">
            {!mine && (
              <button className="btn btn-soft btn-sm" onClick={() => onClaim(lead, null, true)}>
                Take it
              </button>
            )}
            <button className="btn btn-soft btn-sm" aria-expanded={handing} onClick={() => setHanding((h) => !h)}>
              Hand off
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="claim-open-top">
            <WaitPill lead={lead} />
            <span className="claim-help">Nobody&apos;s on it yet</span>
          </div>
          <button className="btn btn-claim btn-block btn-xl" onClick={() => onClaim(lead, null, false)}>
            <Hand size={26} strokeWidth={2.5} /> I&apos;m on it
          </button>
          <button className="text-btn claim-give" aria-expanded={handing} onClick={() => setHanding((h) => !h)}>
            Give it to someone else
          </button>
        </>
      )}

      {handing && (
        <div className="chip-row hand-row" role="group" aria-label={`Who should take ${firstName(lead.name)}?`}>
          {others.map((p) => (
            <button key={p.id} className="chip" onClick={() => handTo(p.id)}>
              {p.id === me.contactId ? "Me" : p.name}
            </button>
          ))}
          {c && (
            <button className="chip" onClick={() => handTo(null)}>
              Nobody
            </button>
          )}
        </div>
      )}
    </div>
  );
}
