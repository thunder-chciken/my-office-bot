"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { AlertCircle, BellRing, Building2, CalendarDays, CheckCircle2, Contact2, Globe, Inbox, Users } from "lucide-react";
import {
  firstName,
  seedContacts,
  seedLeads,
  seedRules,
  testLeadPool,
  timeAgo,
  type Contact,
  type Lead,
  type LeadStatus,
} from "@/lib/data";
import { AccountProvider, LayoutProvider, demoAccount, type Account } from "@/lib/account";
import {
  deleteCustomer,
  removeContact,
  saveBooking,
  saveBusiness,
  saveContact,
  saveCustomer,
  saveEventStatus,
  saveLeadStatus,
} from "@/lib/live";
import { attachLead, blankCustomer, customersFromLeads, type Customer } from "@/lib/customers";
import { useWide } from "@/lib/useWide";
import { turnOffTexts, turnOnTexts } from "@/app/app/actions";
import { loadTestTarget, saveTestTarget, type TestTarget } from "@/lib/contact";
import {
  blankEvent,
  dayLabel,
  jobFromLead,
  nextWorkday,
  seedCrews,
  seedSchedule,
  todayKey,
  type Crew,
  type Job,
  type ScheduleEvent,
} from "@/lib/schedule";
import { LeadsScreen } from "./LeadsScreen";
import { LeadSheet, type ContactMethod } from "./LeadSheet";
import { AlertsScreen } from "./AlertsScreen";
import { WebsiteScreen } from "./WebsiteScreen";
import { BusinessScreen } from "./BusinessScreen";
import { ScheduleScreen } from "./ScheduleScreen";
import { EditorSheet, EventSheet, NotifySheet, type EditTarget } from "./ScheduleSheets";
import { DeskPage, DesktopShell, LeadsDesk } from "./Desktop";
import { CustomerEditSheet, CustomerSheet, CustomersScreen } from "./CustomersScreen";
import { Mascot } from "./ui";

type Tab = "leads" | "schedule" | "customers" | "alerts" | "website" | "business";

// Wider labels for the desktop sidebar.
const deskTabs: { id: Tab; label: string; Icon: typeof Inbox }[] = [
  { id: "leads", label: "Leads", Icon: Inbox },
  { id: "schedule", label: "Schedule", Icon: CalendarDays },
  { id: "customers", label: "Customers", Icon: Contact2 },
  { id: "alerts", label: "Team & alerts", Icon: Users },
  { id: "website", label: "Website & forms", Icon: Globe },
  { id: "business", label: "Business profile", Icon: Building2 },
];

const tabs: { id: Tab; label: string; Icon: typeof Inbox }[] = [
  { id: "leads", label: "Leads", Icon: Inbox },
  { id: "schedule", label: "Schedule", Icon: CalendarDays },
  { id: "customers", label: "Customers", Icon: Contact2 },
  { id: "alerts", label: "Alerts", Icon: BellRing },
  { id: "business", label: "Business", Icon: Building2 },
];

export default function App({
  account: initialAccount = demoAccount,
  initialLeads,
  initialContacts,
  initialCustomers,
  initialSchedule,
  variant = "showcase",
}: {
  account?: Account;
  initialLeads?: Lead[];
  initialContacts?: Contact[];
  initialCustomers?: Customer[];
  initialSchedule?: { events: ScheduleEvent[]; jobs: Job[]; crews: Crew[] };
  // "showcase": the public demo at / (always the phone frame). "app": a real dashboard that
  // switches to the desktop layout on wide screens.
  variant?: "showcase" | "app";
}) {
  const [account, setAccount] = useState(initialAccount);
  const live = account.live;
  const wide = useWide() && variant === "app";
  const [tab, setTab] = useState<Tab>("leads");
  const [leads, setLeads] = useState(initialLeads ?? seedLeads);
  const [contacts, setContacts] = useState(initialContacts ?? seedContacts);
  const [rules, setRules] = useState(seedRules);
  const [customers, setCustomers] = useState<Customer[]>(() => initialCustomers ?? customersFromLeads(seedLeads));
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerDraft, setCustomerDraft] = useState<Customer | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [banner, setBanner] = useState<Lead | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const bannerTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const testIndex = useRef(0);
  const [test, setTest] = useState<TestTarget>({ phone: "", email: "" });
  // Signed-in accounts start with an empty calendar; saving it to the database comes next.
  const [crews] = useState<Crew[]>(() => initialSchedule?.crews ?? (live ? [] : seedCrews));
  const [jobs, setJobs] = useState<Job[]>(() => initialSchedule?.jobs ?? (live ? [] : seedSchedule().jobs));
  const [events, setEvents] = useState<ScheduleEvent[]>(() => initialSchedule?.events ?? (live ? [] : seedSchedule().events));
  const [eventId, setEventId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [notify, setNotify] = useState<{ event: ScheduleEvent; moved: boolean } | null>(null);

  useEffect(() => setTest(loadTestTarget()), []);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  // ---- text alerts (D56): consent first, then the server sends the welcome or YES-confirmation text.

  const textOn = async (c: Contact, self: boolean) => {
    if (!live) {
      setContacts((cs) => cs.map((x) => (x.id === c.id ? { ...x, channels: { ...x.channels, sms: true }, sms: "on" } : x)));
      showToast(`Texts on for ${c.name}`);
      return true;
    }
    const { state, note, error } = await turnOnTexts(c.id, self);
    if (error || !state) {
      showToast(error ?? "Couldn't turn on texts", true);
      return false;
    }
    setContacts((cs) => cs.map((x) => (x.id === c.id ? { ...x, channels: { ...x.channels, sms: true }, sms: state } : x)));
    showToast(note ?? "Saved");
    return true;
  };

  const textOff = async (c: Contact) => {
    if (live) {
      const { error } = await turnOffTexts(c.id);
      if (error) return showToast(error, true);
    }
    setContacts((cs) => cs.map((x) => (x.id === c.id ? { ...x, channels: { ...x.channels, sms: false }, sms: "off" } : x)));
    showToast(`Texts off for ${c.name}`);
  };

  // ---- customers (D53)

  const saveCustomerRecord = async (c: Customer) => {
    let saved = c;
    if (live) {
      const { id, error } = await saveCustomer(c);
      if (error || !id) {
        showToast(error ?? "Couldn't save", true);
        return false;
      }
      saved = { ...c, id };
    } else if (!c.id) saved = { ...c, id: `cu-${Date.now()}` };
    setCustomers((cs) => (cs.some((x) => x.id === saved.id) ? cs.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...cs]));
    setCustomerDraft(null);
    setCustomerId(saved.id);
    showToast(c.id ? "Saved" : `${saved.name} added`);
    return true;
  };

  const removeCustomerRecord = async (c: Customer) => {
    if (live) {
      const { error } = await deleteCustomer(c.id);
      if (error) return showToast(error, true);
    }
    setCustomers((cs) => cs.filter((x) => x.id !== c.id));
    setCustomerId(null);
    showToast(`${c.name} deleted`);
  };

  const updateTest = (t: TestTarget) => {
    setTest(t);
    saveTestTarget(t);
  };

  const showToast = useCallback((text: string, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? 4200 : 2400);
  }, []);

  // ---- saving (signed-in accounts only; the demo just updates the screen)

  const persistStatus = async (id: string, status: LeadStatus) => {
    if (!live) return;
    const { error } = await saveLeadStatus(id, status);
    if (error) showToast(error, true);
  };

  const saveProfile = async (next: Account) => {
    if (live) {
      const { error } = await saveBusiness(next);
      if (error) {
        showToast(error, true);
        return false;
      }
    }
    setAccount(next);
    showToast("Saved");
    return true;
  };

  const addContact = async (c: Contact) => {
    let saved = c;
    if (live) {
      const { id, error } = await saveContact(c, true);
      if (error || !id) {
        showToast(error ?? "Couldn't save", true);
        return false;
      }
      saved = { ...c, id };
    }
    setContacts((cs) => [...cs, saved]);
    showToast(`${c.name} added`);
    return true;
  };

  const updateContact = async (c: Contact) => {
    if (live) {
      const { error } = await saveContact(c, false);
      if (error) {
        showToast(error, true);
        return false;
      }
    }
    setContacts((cs) => cs.map((x) => (x.id === c.id ? c : x)));
    return true;
  };

  const dropContact = async (c: Contact) => {
    if (live) {
      const { error } = await removeContact(c.id);
      if (error) return showToast(error, true);
    }
    setContacts((cs) => cs.filter((x) => x.id !== c.id));
    showToast(`${c.name} removed`);
  };

  const patchLead = (id: string, fn: (l: Lead) => Lead) =>
    setLeads((ls) => ls.map((l) => (l.id === id ? fn(l) : l)));

  const contactLead = (lead: Lead, how: ContactMethod, text?: string) => {
    const name = firstName(lead.name);
    const messages: Record<ContactMethod, string> = {
      call: `Calling ${name}…`,
      text: text ? `Opening Messages with your reply…` : `Opening Messages…`,
      email: `Opening Mail…`,
      directions: `Opening Maps…`,
    };
    showToast(messages[how]);
    if (how === "directions") return;
    const verb = { call: "called", text: "texted", email: "emailed" }[how];
    if (lead.status === "new") void persistStatus(lead.id, "contacted");
    patchLead(lead.id, (l) => ({
      ...l,
      status: l.status === "new" ? "contacted" : l.status,
      alerts: [...l.alerts, { minutesAgo: 0, text: `You ${verb} ${name}`, ok: true }],
    }));
  };

  const setStatus = (lead: Lead, status: LeadStatus) => {
    patchLead(lead.id, (l) => ({ ...l, status }));
    void persistStatus(lead.id, status);
    if (status === "booked") showToast(`${firstName(lead.name)} marked as booked`);
  };

  // ---- scheduling (docs/SCHEDULING.md)

  const newBooking = (date: string, job?: Job) =>
    setEditing({ draft: { ...blankEvent("appointment", date), jobId: job?.id, personIds: contacts[0] ? [contacts[0].id] : [] }, job, mode: "new" });

  const scheduleLead = (lead: Lead) => {
    setOpenId(null);
    setTab("schedule");
    newBooking(nextWorkday(todayKey()), jobs.find((j) => j.leadId === lead.id) ?? jobFromLead(lead));
  };

  const saveEvent = async (input: ScheduleEvent, inputJob: Job | undefined, mode: EditTarget["mode"]) => {
    let draft = input;
    let job = inputJob;
    if (live) {
      // Save first; the database assigns the real ids and has the final say on double-booking.
      const newJob = job && !jobs.some((j) => j.id === job!.id) ? job : undefined;
      const { eventId, jobId, error } = await saveBooking(draft, newJob);
      if (error || !eventId) return showToast(error ?? "Couldn't save. Try again.", true);
      if (newJob && jobId) job = { ...newJob, id: jobId };
      draft = { ...draft, id: eventId, jobId: job?.id ?? draft.jobId };
    }
    const saved = draft;
    if (job) {
      const j = job;
      setJobs((js) => (js.some((x) => x.id === j.id) ? js : [...js, j]));
    }
    setEvents((es) => (es.some((e) => e.id === saved.id) ? es.map((e) => (e.id === saved.id ? saved : e)) : [...es, saved]));
    if (job?.leadId && mode === "new") {
      void persistStatus(job.leadId, "booked");
      patchLead(job.leadId, (l) => ({
        ...l,
        status: "booked",
        alerts: [...l.alerts, { minutesAgo: 0, text: `Booked ${draft.title.toLowerCase()} for ${dayLabel(draft.date)}`, ok: true }],
      }));
    }
    setEditing(null);
    if (draft.type === "unavailable") showToast("Time off saved");
    else if (mode === "edit") showToast("Saved");
    else setNotify({ event: draft, moved: mode === "move" });
  };

  const setEventStatus = async (e: ScheduleEvent, status: ScheduleEvent["status"]) => {
    if (live) {
      const { error } = await saveEventStatus(e.id, status);
      if (error) return showToast(error, true);
    }
    setEvents((es) => es.map((x) => (x.id === e.id ? { ...x, status } : x)));
    if (status === "canceled") {
      setEventId(null);
      showToast("Canceled");
    } else if (status === "done") showToast("Marked done");
  };

  const openEvent = events.find((e) => e.id === eventId) ?? null;

  const sendTestLead = () => {
    // Signed in: send a real lead through this business's own form, so the email alert really fires.
    if (live) {
      if (account.siteKey) window.open(`/beta/form?key=${account.siteKey}`, "_blank", "noopener");
      return;
    }
    const base = testLeadPool[testIndex.current % testLeadPool.length]!;
    testIndex.current += 1;
    const alerted = contacts.filter((c) => c.channels.sms || c.channels.email || c.channels.call);
    const lead: Lead = {
      ...base,
      id: `t${Date.now()}`,
      minutesAgo: 0,
      status: "new",
      alerts: alerted.flatMap((c) => {
        const ev = [];
        if (c.channels.sms) ev.push({ minutesAgo: 0, text: `Texted ${c.name}`, ok: true });
        if (c.channels.email) ev.push({ minutesAgo: 0, text: `Emailed ${c.name}`, ok: true });
        return ev;
      }),
    };
    setLeads((ls) => [lead, ...ls]);
    setCustomers((cs) => attachLead(cs, lead));
    clearTimeout(bannerTimer.current);
    setBanner(lead);
    bannerTimer.current = setTimeout(() => setBanner(null), 6000);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([30, 60, 30]);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied");
    } catch {
      showToast("Couldn't copy — long-press to select");
    }
  };

  const openLead = leads.find((l) => l.id === openId) ?? null;
  const newCount = leads.filter((l) => l.status === "new").length;

  const screenFor = (t: Tab) => {
    switch (t) {
      case "leads":
        return <LeadsScreen leads={leads} test={test} onOpen={setOpenId} onContact={contactLead} />;
      case "schedule":
        return (
          <ScheduleScreen
            events={events}
            jobs={jobs}
            crews={crews}
            contacts={contacts}
            leads={leads}
            onOpenEvent={setEventId}
            onNew={(date) => newBooking(date)}
            onScheduleJob={(job) => newBooking(nextWorkday(todayKey()), job)}
            onScheduleLead={scheduleLead}
          />
        );
      case "alerts":
        return (
          <AlertsScreen
            contacts={contacts}
            onAdd={addContact}
            onUpdate={updateContact}
            onRemove={dropContact}
            onTextOn={textOn}
            onTextOff={textOff}
            rules={rules}
            setRules={setRules}
            onTest={sendTestLead}
          />
        );
      case "customers":
        return <CustomersScreen customers={customers} leads={leads} onOpen={setCustomerId} onAdd={() => setCustomerDraft(blankCustomer())} />;
      case "website":
        return <WebsiteScreen onCopy={copy} onTestLead={sendTestLead} />;
      case "business":
        return (
          <BusinessScreen
            test={test}
            onTestChange={updateTest}
            onSaveProfile={saveProfile}
            onOpenWebsite={() => setTab("website")}
            stats={
              live
                ? {
                    leads: leads.filter((l) => l.minutesAgo < 7 * 24 * 60).length,
                    reply: "—",
                    booked: leads.filter((l) => l.status === "booked").length,
                  }
                : {
                    leads: leads.length + 8,
                    reply: "6 min",
                    booked: leads.filter((l) => l.status === "booked").length + 4,
                  }
            }
          />
        );
    }
  };

  // Sheets and the toast, shared by both layouts.
  const overlays = (
    <>
      {!wide && (
        <LeadSheet
          lead={openLead}
          test={test}
          onClose={() => setOpenId(null)}
          onContact={contactLead}
          onStatus={setStatus}
          onSchedule={scheduleLead}
        />
      )}

      <EventSheet
        event={openEvent}
        job={jobs.find((j) => j.id === openEvent?.jobId)}
        events={events}
        crews={crews}
        contacts={contacts}
        test={test}
        onClose={() => setEventId(null)}
        onMove={(e) => {
          setEventId(null);
          setEditing({ draft: { ...e }, job: jobs.find((j) => j.id === e.jobId), mode: "move", original: e });
        }}
        onEdit={(e) => {
          setEventId(null);
          setEditing({ draft: { ...e }, job: jobs.find((j) => j.id === e.jobId), mode: "edit", original: e });
        }}
        onNotify={(e) => {
          setEventId(null);
          setNotify({ event: e, moved: false });
        }}
        onStatus={setEventStatus}
      />

      <EditorSheet
        target={editing}
        events={events}
        crews={crews}
        contacts={contacts}
        onClose={() => setEditing(null)}
        onSave={saveEvent}
      />

      <CustomerSheet
        customer={customers.find((c) => c.id === customerId) ?? null}
        leads={leads}
        test={test}
        onClose={() => setCustomerId(null)}
        onEdit={(c) => {
          setCustomerId(null);
          setCustomerDraft(c);
        }}
        onDelete={removeCustomerRecord}
        onOpenLead={(id) => {
          setCustomerId(null);
          setTab("leads");
          setOpenId(id);
        }}
      />

      <CustomerEditSheet customer={customerDraft} onClose={() => setCustomerDraft(null)} onSave={saveCustomerRecord} />

      <NotifySheet
        target={notify}
        job={jobs.find((j) => j.id === notify?.event.jobId)}
        crews={crews}
        contacts={contacts}
        test={test}
        onClose={() => setNotify(null)}
        onSent={(e, how) => {
          setEvents((es) => es.map((x) => (x.id === e.id ? { ...x, status: "confirmed" } : x)));
          if (live) void saveEventStatus(e.id, "confirmed");
          setNotify(null);
          showToast(how === "text" ? "Opening Messages…" : "Opening Mail…");
        }}
      />

      <div className="toast-wrap" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.text}
              className={`toast${toast.error ? " is-error" : ""}`}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            >
              {toast.error ? <AlertCircle size={22} strokeWidth={2.5} /> : <CheckCircle2 size={22} strokeWidth={2.5} />}{" "}
              {toast.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );

  if (wide) {
    return (
      <AccountProvider value={account}>
        <LayoutProvider value="desktop">
          <MotionConfig reducedMotion="user">
            <DesktopShell nav={deskTabs} tab={tab} onTab={setTab} newCount={newCount}>
              {tab === "leads" ? (
                <LeadsDesk
                  leads={leads}
                  selectedId={openId ?? leads[0]?.id ?? null}
                  onSelect={setOpenId}
                  test={test}
                  onContact={contactLead}
                  onStatus={setStatus}
                  onSchedule={scheduleLead}
                />
              ) : (
                <DeskPage key={tab}>{screenFor(tab)}</DeskPage>
              )}
              {overlays}
            </DesktopShell>
          </MotionConfig>
        </LayoutProvider>
      </AccountProvider>
    );
  }

  return (
    <AccountProvider value={account}>
    <MotionConfig reducedMotion="user">
      <div className={`stage${variant === "app" ? " is-app" : ""}`}>
        <aside className="stage-intro">
          <Mascot size={120} className="stage-mascot" />
          <h1>
            My <span className="wordmark-blue">Office</span> Bot
          </h1>
          <p>
            Every website lead, straight to your phone — by text, email, or a phone call. Reply with one tap
            and get back to work.
          </p>
          {live ? (
            <p className="stage-hint">Signed in as {account.ownerEmail}</p>
          ) : (
            <>
              <p className="stage-hint">Interactive prototype. Try “Send a test lead” on the Website tab.</p>
              <div className="stage-cta">
                <a className="btn btn-primary" href="/signup">
                  Create your account
                </a>
                <a className="btn btn-soft" href="/login">
                  Sign in
                </a>
              </div>
              <a className="stage-compare" href="/compare">
                See how we compare to Housecall Pro and Jobber →
              </a>
            </>
          )}
        </aside>

        <div className="device">
          <div className="status-bar" aria-hidden>
            <span>9:41</span>
            <span className="status-icons">
              <i className="sig" />
              <i className="bat" />
            </span>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.main
              key={tab}
              className="screen"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {screenFor(tab)}
            </motion.main>
          </AnimatePresence>

          <nav className="tab-bar" aria-label="Main">
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`tab${tab === id || (id === "business" && tab === "website") ? " is-active" : ""}`}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id)}
              >
                <span className="tab-icon">
                  <Icon size={28} strokeWidth={tab === id ? 2.5 : 2} />
                  {id === "leads" && newCount > 0 && <span className="badge">{newCount}</span>}
                </span>
                {label}
              </button>
            ))}
          </nav>

          <AnimatePresence>
            {banner && (
              <motion.button
                key={banner.id}
                className="banner"
                initial={{ y: -140, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -140, opacity: 0 }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0.8, bottom: 0.1 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y < -40 || info.velocity.y < -400) setBanner(null);
                }}
                onClick={() => {
                  setBanner(null);
                  setTab("leads");
                  setOpenId(banner.id);
                }}
              >
                <span className="banner-icon">
                  <Mascot size={36} />
                </span>
                <span className="banner-body">
                  <span className="banner-meta">
                    <b>New lead{banner.urgent ? " · Urgent" : ""}</b>
                    <span>{timeAgo(banner.minutesAgo).toLowerCase()}</span>
                  </span>
                  <span className="banner-title">
                    {banner.name} — {banner.service}
                  </span>
                  <span className="banner-text">{banner.message}</span>
                </span>
              </motion.button>
            )}
          </AnimatePresence>

          {overlays}
        </div>
      </div>
    </MotionConfig>
    </AccountProvider>
  );
}
