"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { BellRing, Building2, CalendarDays, CheckCircle2, Globe, Inbox } from "lucide-react";
import {
  firstName,
  seedContacts,
  seedLeads,
  seedRules,
  testLeadPool,
  timeAgo,
  type Lead,
  type LeadStatus,
} from "@/lib/data";
import { loadTestTarget, saveTestTarget, type TestTarget } from "@/lib/contact";
import {
  blankEvent,
  dayLabel,
  jobFromLead,
  nextWorkday,
  seedCrews,
  seedSchedule,
  todayKey,
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
import { Mascot } from "./ui";

type Tab = "leads" | "schedule" | "alerts" | "website" | "business";

const tabs: { id: Tab; label: string; Icon: typeof Inbox }[] = [
  { id: "leads", label: "Leads", Icon: Inbox },
  { id: "schedule", label: "Schedule", Icon: CalendarDays },
  { id: "alerts", label: "Alerts", Icon: BellRing },
  { id: "website", label: "Website", Icon: Globe },
  { id: "business", label: "Business", Icon: Building2 },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("leads");
  const [leads, setLeads] = useState(seedLeads);
  const [contacts, setContacts] = useState(seedContacts);
  const [rules, setRules] = useState(seedRules);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [banner, setBanner] = useState<Lead | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const bannerTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const testIndex = useRef(0);
  const [test, setTest] = useState<TestTarget>({ phone: "", email: "" });
  const [crews] = useState(seedCrews);
  const [jobs, setJobs] = useState<Job[]>(() => seedSchedule().jobs);
  const [events, setEvents] = useState<ScheduleEvent[]>(() => seedSchedule().events);
  const [eventId, setEventId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [notify, setNotify] = useState<{ event: ScheduleEvent; moved: boolean } | null>(null);

  useEffect(() => setTest(loadTestTarget()), []);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  const updateTest = (t: TestTarget) => {
    setTest(t);
    saveTestTarget(t);
  };

  const showToast = useCallback((msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

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
    patchLead(lead.id, (l) => ({
      ...l,
      status: l.status === "new" ? "contacted" : l.status,
      alerts: [...l.alerts, { minutesAgo: 0, text: `You ${verb} ${name}`, ok: true }],
    }));
  };

  const setStatus = (lead: Lead, status: LeadStatus) => {
    patchLead(lead.id, (l) => ({ ...l, status }));
    if (status === "booked") showToast(`${firstName(lead.name)} marked as booked`);
  };

  // ---- scheduling (docs/SCHEDULING.md)

  const newBooking = (date: string, job?: Job) =>
    setEditing({ draft: { ...blankEvent("appointment", date), jobId: job?.id, personIds: ["c1"] }, job, mode: "new" });

  const scheduleLead = (lead: Lead) => {
    setOpenId(null);
    setTab("schedule");
    newBooking(nextWorkday(todayKey()), jobs.find((j) => j.leadId === lead.id) ?? jobFromLead(lead));
  };

  const saveEvent = (draft: ScheduleEvent, job: Job | undefined, mode: EditTarget["mode"]) => {
    if (job) setJobs((js) => (js.some((j) => j.id === job.id) ? js : [...js, job]));
    setEvents((es) => (es.some((e) => e.id === draft.id) ? es.map((e) => (e.id === draft.id ? draft : e)) : [...es, draft]));
    if (job?.leadId && mode === "new") {
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

  const setEventStatus = (e: ScheduleEvent, status: ScheduleEvent["status"]) => {
    setEvents((es) => es.map((x) => (x.id === e.id ? { ...x, status } : x)));
    if (status === "canceled") {
      setEventId(null);
      showToast("Canceled");
    } else if (status === "done") showToast("Marked done");
  };

  const openEvent = events.find((e) => e.id === eventId) ?? null;

  const sendTestLead = () => {
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

  return (
    <MotionConfig reducedMotion="user">
      <div className="stage">
        <aside className="stage-intro">
          <Mascot size={120} className="stage-mascot" />
          <h1>
            My <span className="wordmark-blue">Office</span> Bot
          </h1>
          <p>
            Every website lead, straight to your phone — by text, email, or a phone call. Reply with one tap
            and get back to work.
          </p>
          <p className="stage-hint">Interactive prototype. Try “Send a test lead” on the Website tab.</p>
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
              {tab === "leads" && (
                <LeadsScreen leads={leads} test={test} onOpen={setOpenId} onContact={contactLead} />
              )}
              {tab === "schedule" && (
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
              )}
              {tab === "alerts" && (
                <AlertsScreen
                  contacts={contacts}
                  setContacts={setContacts}
                  rules={rules}
                  setRules={setRules}
                  onTest={sendTestLead}
                />
              )}
              {tab === "website" && <WebsiteScreen onCopy={copy} onTestLead={sendTestLead} />}
              {tab === "business" && (
                <BusinessScreen
                  test={test}
                  onTestChange={updateTest}
                  stats={{
                    leads: leads.length + 8,
                    reply: "6 min",
                    booked: leads.filter((l) => l.status === "booked").length + 4,
                  }}
                />
              )}
            </motion.main>
          </AnimatePresence>

          <nav className="tab-bar" aria-label="Main">
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`tab${tab === id ? " is-active" : ""}`}
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

          <LeadSheet
            lead={openLead}
            test={test}
            onClose={() => setOpenId(null)}
            onContact={contactLead}
            onStatus={setStatus}
            onSchedule={scheduleLead}
          />

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

          <NotifySheet
            target={notify}
            job={jobs.find((j) => j.id === notify?.event.jobId)}
            crews={crews}
            contacts={contacts}
            test={test}
            onClose={() => setNotify(null)}
            onSent={(e, how) => {
              setEvents((es) => es.map((x) => (x.id === e.id ? { ...x, status: "confirmed" } : x)));
              setNotify(null);
              showToast(how === "text" ? "Opening Messages…" : "Opening Mail…");
            }}
          />

          <div className="toast-wrap" aria-live="polite">
            <AnimatePresence>
              {toast && (
                <motion.div
                  key={toast}
                  className="toast"
                  initial={{ opacity: 0, y: 16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                >
                  <CheckCircle2 size={22} strokeWidth={2.5} /> {toast}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}
