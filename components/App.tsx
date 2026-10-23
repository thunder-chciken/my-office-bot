"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { BellRing, Building2, CheckCircle2, Globe, Inbox, Zap } from "lucide-react";
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
import { LeadsScreen } from "./LeadsScreen";
import { LeadSheet, type ContactMethod } from "./LeadSheet";
import { AlertsScreen } from "./AlertsScreen";
import { WebsiteScreen } from "./WebsiteScreen";
import { BusinessScreen } from "./BusinessScreen";

type Tab = "leads" | "alerts" | "website" | "business";

const tabs: { id: Tab; label: string; Icon: typeof Inbox }[] = [
  { id: "leads", label: "Leads", Icon: Inbox },
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
      text: text ? `Text sent to ${name}` : `Opening text to ${name}…`,
      email: `Opening email to ${name}…`,
      directions: `Opening directions…`,
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
          <span className="app-mark">
            <Zap size={28} strokeWidth={2.6} />
          </span>
          <h1>My Office Bot</h1>
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
              {tab === "leads" && <LeadsScreen leads={leads} onOpen={setOpenId} onContact={contactLead} />}
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
                  <Zap size={22} strokeWidth={2.6} />
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

          <LeadSheet lead={openLead} onClose={() => setOpenId(null)} onContact={contactLead} onStatus={setStatus} />

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
