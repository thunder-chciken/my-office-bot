"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, History, Mail, PauseCircle, PlayCircle, Search, Trash2, Users } from "lucide-react";
import type { AdminBusiness, AdminData, AdminPerson } from "@/lib/server/admin";
import { deleteBusiness, deletePerson, sendCrewEmailsNow, setBusinessPaused, setBusinessTexts } from "@/app/admin/actions";
import { browserClient } from "@/lib/supabase/client";
import { Mascot, Segmented } from "../ui";

type View = "businesses" | "people" | "problems" | "activity";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

type Confirm =
  | { kind: "business"; business: AdminBusiness }
  | { kind: "person"; person: AdminPerson };

export function AdminConsole({ data, meId, meEmail }: { data: AdminData; meId: string; meEmail: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>("businesses");
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const q = query.trim().toLowerCase();

  const run = (fn: () => Promise<{ error?: string }>, done: string) =>
    start(async () => {
      const { error } = await fn();
      setNotice(error ? { text: error, error: true } : { text: done });
      if (!error) {
        setConfirm(null);
        router.refresh();
      }
    });

  const businesses = data.businesses.filter(
    (b) => !q || [b.name, b.domain ?? "", b.city ?? "", ...b.owners.map((o) => o.email)].some((v) => v.toLowerCase().includes(q)),
  );
  const people = data.people.filter(
    (p) => !q || [p.email, p.name, ...p.businesses.map((b) => b.name)].some((v) => v.toLowerCase().includes(q)),
  );

  return (
    <div className="admin">
      <header className="admin-top">
        <a href="/app" className="desk-brand" aria-label="My Office Bot">
          <Mascot size={40} />
          <span className="wordmark">
            My <span className="wordmark-blue">Office</span> Bot <span className="admin-tag">Admin</span>
          </span>
        </a>
        <div className="admin-me">
          <button
            className="btn btn-soft admin-small"
            disabled={pending}
            title="Emails everyone booked tomorrow their schedule now, instead of waiting for the evening run"
            onClick={() =>
              start(async () => {
                const { error, summary } = await sendCrewEmailsNow();
                setNotice(error ? { text: error, error: true } : { text: summary ?? "Done." });
                router.refresh();
              })
            }
          >
            <Mail size={18} /> Send tomorrow&apos;s crew emails now
          </button>
          <span className="muted">{meEmail}</span>
          <button
            className="btn btn-soft admin-small"
            onClick={async () => {
              await browserClient().auth.signOut();
              window.location.href = "/login";
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-stats">
          <Stat label="Businesses" value={data.stats.businesses} />
          <Stat label="People signed up" value={data.stats.people} />
          <Stat label="Leads, last 7 days" value={data.stats.leads7d} />
          <Stat label="Failed alerts, 7 days" value={data.stats.failed7d} warn={data.stats.failed7d > 0} />
        </div>

        {notice && (
          <p className={`admin-notice${notice.error ? " is-error" : ""}`} role="status">
            {notice.text}
          </p>
        )}

        <div className="admin-bar">
          <Segmented
            label="Admin view"
            value={view}
            onChange={setView}
            options={[
              { value: "businesses", label: "Businesses", count: data.businesses.length },
              { value: "people", label: "People", count: data.people.length },
              { value: "problems", label: "Problems", count: data.problems.length },
              { value: "activity", label: "Admin log" },
            ]}
          />
          {(view === "businesses" || view === "people") && (
            <label className="desk-search admin-search">
              <Search size={20} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, website…" />
            </label>
          )}
        </div>

        {view === "businesses" && (
          <div className="admin-card">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Owner</th>
                  <th>Signed up</th>
                  <th className="num">Leads</th>
                  <th className="num">7 days</th>
                  <th className="num" title="Businesses that signed up from this one's chat bubble link">Referred</th>
                  <th>Last lead</th>
                  <th>Status</th>
                  <th>Texts</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {businesses.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <b>{b.name}</b>
                      <div className="muted">{[b.domain, b.city].filter(Boolean).join(" · ") || "No website yet"}</div>
                    </td>
                    <td>{b.owners.length ? b.owners.map((o) => o.email).join(", ") : <span className="muted">No sign-in (set up by hand)</span>}</td>
                    <td>{day(b.createdAt)}</td>
                    <td className="num">{b.leadsTotal}</td>
                    <td className="num">{b.leads7d}</td>
                    <td className="num">{b.referrals || "—"}</td>
                    <td>{when(b.lastLeadAt)}</td>
                    <td>
                      <span className={`pill ${b.status === "suspended" ? "pill-urgent" : "status-booked"}`}>
                        {b.status === "suspended" ? "Paused" : "Active"}
                      </span>
                    </td>
                    <td>
                      <button
                        className={`pill admin-toggle ${b.smsStatus === "active" ? "status-booked" : ""}`}
                        disabled={pending}
                        title={b.smsStatus === "active" ? "Turn texts off for this business" : "Turn texts on once its carrier registration is approved"}
                        onClick={() =>
                          start(async () => {
                            const { error, summary } = await setBusinessTexts(b.id, b.smsStatus !== "active");
                            setNotice(error ? { text: error, error: true } : { text: summary ?? "Done." });
                            router.refresh();
                          })
                        }
                      >
                        {b.smsStatus === "active" ? "On" : "Off"}
                      </button>
                    </td>
                    <td className="admin-actions">
                      <button
                        className="btn btn-soft admin-small"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => setBusinessPaused(b.id, b.status !== "suspended"),
                            b.status === "suspended" ? `${b.name} is active again.` : `${b.name} is paused.`,
                          )
                        }
                      >
                        {b.status === "suspended" ? <PlayCircle size={18} /> : <PauseCircle size={18} />}
                        {b.status === "suspended" ? "Resume" : "Pause"}
                      </button>
                      <button className="btn admin-small admin-danger" onClick={() => setConfirm({ kind: "business", business: b })}>
                        <Trash2 size={18} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {businesses.length === 0 && (
                  <tr>
                    <td colSpan={10} className="empty">No businesses match.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {view === "people" && (
          <div className="admin-card">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Signs in with</th>
                  <th>Business</th>
                  <th>Joined</th>
                  <th>Last sign-in</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.email}</b>
                      {p.id === meId && <span className="pill admin-you">You</span>}
                      <div className="muted">
                        {p.name || "—"}
                        {!p.confirmed && " · email not confirmed"}
                      </div>
                    </td>
                    <td className="admin-cap">{p.provider}</td>
                    <td>{p.businesses.length ? p.businesses.map((b) => b.name).join(", ") : <span className="muted">Not set up yet</span>}</td>
                    <td>{day(p.createdAt)}</td>
                    <td>{when(p.lastSignInAt)}</td>
                    <td className="admin-actions">
                      {p.id !== meId && (
                        <button className="btn admin-small admin-danger" onClick={() => setConfirm({ kind: "person", person: p })}>
                          <Trash2 size={18} /> Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {people.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">No people match.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {view === "problems" && (
          <div className="admin-card">
            {data.problems.length ? (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Business</th>
                    <th>Alert to</th>
                    <th>Result</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.problems.map((p) => (
                    <tr key={p.id}>
                      <td>{when(p.at)}</td>
                      <td>{p.business}</td>
                      <td>{p.to}</td>
                      <td>
                        <span className="pill pill-urgent">{p.status === "uncertain" ? "Unsure" : "Failed"}</span>
                      </td>
                      <td className="muted">{p.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty">
                <AlertTriangle size={20} /> No failed alert emails. Every lead alert so far went out.
              </p>
            )}
          </div>
        )}

        {view === "activity" && (
          <div className="admin-card">
            {data.audit.length ? (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>What</th>
                    <th>On</th>
                  </tr>
                </thead>
                <tbody>
                  {data.audit.map((a) => (
                    <tr key={a.id}>
                      <td>{when(a.at)}</td>
                      <td>{a.actor}</td>
                      <td className="admin-cap">{a.action.replace(/_/g, " ")}</td>
                      <td>{a.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty">
                <History size={20} /> No admin actions yet. Pauses and deletions will be listed here.
              </p>
            )}
          </div>
        )}
      </main>

      {confirm && (
        <ConfirmDelete
          confirm={confirm}
          pending={pending}
          onCancel={() => setConfirm(null)}
          onConfirm={(typed, alsoBusinesses) =>
            confirm.kind === "business"
              ? run(() => deleteBusiness(confirm.business.id, typed), `${confirm.business.name} was deleted.`)
              : run(() => deletePerson(confirm.person.id, typed, alsoBusinesses), `${confirm.person.email} was deleted.`)
          }
        />
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`admin-stat${warn ? " is-warn" : ""}`}>
      <span className="stat-num">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function ConfirmDelete({
  confirm,
  pending,
  onCancel,
  onConfirm,
}: {
  confirm: Confirm;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (typed: string, alsoBusinesses: boolean) => void;
}) {
  const isBusiness = confirm.kind === "business";
  const target = isBusiness ? confirm.business.name : confirm.person.email;
  const solo = isBusiness ? [] : confirm.person.businesses.filter((b) => b.soleMember);
  const [typed, setTyped] = useState("");
  const [alsoBusinesses, setAlsoBusinesses] = useState(solo.length > 0);
  const matches = isBusiness ? typed.trim() === target.trim() : typed.trim().toLowerCase() === target.toLowerCase();

  return (
    <div className="admin-modal-wrap" role="dialog" aria-modal="true" aria-label={`Delete ${target}`}>
      <div className="admin-scrim" onClick={onCancel} />
      <div className="admin-modal">
        <h2 className="admin-modal-title">
          {isBusiness ? <Building2 size={24} /> : <Users size={24} />} Delete {isBusiness ? "business" : "person"}?
        </h2>
        {isBusiness ? (
          <p>
            This permanently deletes <b>{target}</b>: its {confirm.business.leadsTotal} leads, team, form and schedule. Its
            form stops working right away. People who sign in to it keep their login and will be asked to set up a business
            again.
          </p>
        ) : (
          <>
            <p>
              This permanently deletes the sign-in for <b>{target}</b>. They won&apos;t be able to log in.
            </p>
            {solo.length > 0 && (
              <label className="admin-check">
                <input type="checkbox" checked={alsoBusinesses} onChange={(e) => setAlsoBusinesses(e.target.checked)} />
                <span>
                  Also delete their business{solo.length > 1 ? "es" : ""}: <b>{solo.map((b) => b.name).join(", ")}</b> (only
                  they use {solo.length > 1 ? "them" : "it"})
                </span>
              </label>
            )}
          </>
        )}
        <p className="admin-warn">
          <AlertTriangle size={18} /> This can&apos;t be undone.
        </p>
        <label className="field">
          <span>
            Type <b>{target}</b> to confirm
          </span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
        </label>
        <div className="admin-modal-actions">
          <button className="btn btn-soft" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button className="btn admin-danger-solid" disabled={!matches || pending} onClick={() => onConfirm(typed, alsoBusinesses)}>
            <Trash2 size={20} /> {pending ? "Deleting…" : "Delete forever"}
          </button>
        </div>
      </div>
    </div>
  );
}
