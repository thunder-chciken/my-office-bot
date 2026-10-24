"use client";

import { useState } from "react";
import {
  Check,
  ChevronRight,
  CreditCard,
  Droplet,
  Globe,
  Grid3x3,
  Hammer,
  Home,
  LifeBuoy,
  LogIn,
  LogOut,
  Pencil,
  Scale,
  UserPlus,
  Wind,
  Zap,
} from "lucide-react";
import { initials } from "@/lib/data";
import { useAccount, useLayout, type Account } from "@/lib/account";
import type { TestTarget } from "@/lib/contact";
import { timezones } from "@/lib/live";
import { browserClient } from "@/lib/supabase/client";
import { Header, SectionTitle, Sheet } from "./ui";

const tradeList = [
  { name: "Roofing", Icon: Home },
  { name: "HVAC", Icon: Wind },
  { name: "Remodeling", Icon: Hammer },
  { name: "Tile", Icon: Grid3x3 },
  { name: "Plumbing", Icon: Droplet },
  { name: "Electrical", Icon: Zap },
];

export function BusinessScreen({
  stats,
  test,
  onTestChange,
  onSaveProfile,
  onOpenWebsite,
}: {
  stats: { leads: number; reply: string; booked: number };
  test: TestTarget;
  onTestChange: (t: TestTarget) => void;
  onSaveProfile: (next: Account) => Promise<boolean>;
  onOpenWebsite: () => void;
}) {
  const account = useAccount();
  const desktop = useLayout() === "desktop";
  const [editing, setEditing] = useState(false);

  const signOut = async () => {
    await browserClient().auth.signOut();
    window.location.href = "/login";
  };
  const toggleTrade = (t: string) =>
    void onSaveProfile({
      ...account,
      trades: account.trades.includes(t) ? account.trades.filter((x) => x !== t) : [...account.trades, t],
    });
  const place = [account.city, timezones.find((z) => z.value === account.timezone)?.label].filter(Boolean).join(" · ");

  return (
    <>
      <Header title="Business" />

      {desktop ? (
        <div className="card pad">
          <p className="card-lead">Business details</p>
          <ProfileForm onSave={onSaveProfile} />
        </div>
      ) : (
        <button className="card pad profile profile-btn" onClick={() => setEditing(true)}>
          <span className="logo-tile">{initials(account.name)}</span>
          <span className="profile-text">
            <span className="card-lead">{account.name}</span>
            <span className="muted">{place || account.ownerEmail || "Add your city and time zone"}</span>
          </span>
          <Pencil size={20} className="chev" />
        </button>
      )}

      {!desktop && (
        <ul className="card list website-link">
          <li>
            <button className="row row-btn" onClick={onOpenWebsite}>
              <Globe size={22} className="row-icon" />
              <span className="row-text">
                <span>Website &amp; forms</span>
                <span className="muted">Your form address and test form</span>
              </span>
              <ChevronRight size={22} className="chev" />
            </button>
          </li>
        </ul>
      )}

      <SectionTitle>This week</SectionTitle>
      <div className="stat-grid">
        <div className="stat">
          <span className="stat-num">{stats.leads}</span>
          <span className="stat-label">Leads</span>
        </div>
        <div className="stat">
          <span className="stat-num">{stats.reply}</span>
          <span className="stat-label">Avg. reply</span>
        </div>
        <div className="stat">
          <span className="stat-num">{stats.booked}</span>
          <span className="stat-label">Booked</span>
        </div>
      </div>

      <SectionTitle>What you do</SectionTitle>
      <div className="trade-grid">
        {tradeList.map(({ name, Icon }) => {
          const on = account.trades.includes(name);
          return (
            <button key={name} className="trade" aria-pressed={on} onClick={() => toggleTrade(name)}>
              {on && (
                <span className="trade-check">
                  <Check size={14} strokeWidth={3.5} />
                </span>
              )}
              <Icon size={30} strokeWidth={2.2} />
              {name}
            </button>
          );
        })}
      </div>

      <SectionTitle>Test on your phone</SectionTitle>
      <div className="card pad form">
        <p className="muted">
          {account.live
            ? "Put your own number and email here and Call, Text and Email on any lead will go to you instead. Saved on this device only."
            : "The sample customers have fake numbers. Put yours here and Call, Text and Email on any lead will go to you instead. Saved on this phone only."}
        </p>
        <label className="field">
          <span>Your mobile number</span>
          <input
            value={test.phone}
            onChange={(e) => onTestChange({ ...test, phone: e.target.value })}
            placeholder="(555) 555-0100"
            inputMode="tel"
            autoComplete="tel"
          />
        </label>
        <label className="field">
          <span>Your email</span>
          <input
            value={test.email}
            onChange={(e) => onTestChange({ ...test, email: e.target.value })}
            placeholder="you@company.com"
            inputMode="email"
            autoComplete="email"
          />
        </label>
        {(test.phone || test.email) && (
          <button className="btn btn-soft btn-block" onClick={() => onTestChange({ phone: "", email: "" })}>
            Turn off test mode
          </button>
        )}
      </div>

      <SectionTitle>Account</SectionTitle>
      <ul className="card list">
        <li>
          <button className="row row-btn">
            <CreditCard size={22} className="row-icon" />
            <span className="row-text">
              <span>Plan</span>
              <span className="muted">{account.live ? "Free beta" : "Pro trial · 12 days left"}</span>
            </span>
            <ChevronRight size={22} className="chev" />
          </button>
        </li>
        <li>
          <a className="row row-btn row-link" href="mailto:support@myofficebot.app">
            <LifeBuoy size={22} className="row-icon" />
            <span className="row-text">Help &amp; support</span>
            <ChevronRight size={22} className="chev" />
          </a>
        </li>
        {account.live ? (
          <li>
            <button className="row row-btn is-danger" onClick={signOut}>
              <LogOut size={22} className="row-icon" />
              <span className="row-text">Sign out</span>
            </button>
          </li>
        ) : (
          <>
            <li>
              <a className="row row-btn row-link" href="/signup">
                <UserPlus size={22} className="row-icon" />
                <span className="row-text">Create your account</span>
                <ChevronRight size={22} className="chev" />
              </a>
            </li>
            <li>
              <a className="row row-btn row-link" href="/login">
                <LogIn size={22} className="row-icon" />
                <span className="row-text">Sign in</span>
                <ChevronRight size={22} className="chev" />
              </a>
            </li>
            <li>
              <a className="row row-btn row-link" href="/compare">
                <Scale size={22} className="row-icon" />
                <span className="row-text">How we compare</span>
                <ChevronRight size={22} className="chev" />
              </a>
            </li>
          </>
        )}
      </ul>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Business details">
        {editing && (
          <ProfileForm
            onSave={async (next) => {
              const ok = await onSaveProfile(next);
              if (ok) setEditing(false);
              return ok;
            }}
          />
        )}
      </Sheet>
    </>
  );
}

// Business name, phone, city, time zone and website. Inline on desktop, in a sheet on phones.
export function ProfileForm({ onSave }: { onSave: (next: Account) => Promise<boolean> }) {
  const account = useAccount();
  const [draft, setDraft] = useState(account);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Account>) => setDraft((d) => ({ ...d, ...patch }));
  const changed = (["name", "phone", "city", "timezone", "website"] as const).some((k) => draft[k] !== account[k]);

  const save = async () => {
    setBusy(true);
    await onSave({ ...account, name: draft.name.trim(), phone: draft.phone.trim(), city: draft.city.trim(), timezone: draft.timezone, website: draft.website.trim() });
    setBusy(false);
  };

  return (
    <div className="form profile-form">
      <label className="field">
        <span>Business name</span>
        <input value={draft.name} onChange={(e) => set({ name: e.target.value })} autoComplete="organization" />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Business phone</span>
          <input value={draft.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" placeholder="(512) 555-0100" />
        </label>
        <label className="field">
          <span>City</span>
          <input value={draft.city} onChange={(e) => set({ city: e.target.value })} placeholder="Austin, TX" />
        </label>
      </div>
      <label className="field">
        <span>Website</span>
        <input value={draft.website} onChange={(e) => set({ website: e.target.value })} inputMode="url" placeholder="yourcompany.com" />
      </label>
      <div className="field">
        <span>Time zone</span>
        <div className="chip-row">
          {timezones.map((z) => (
            <button key={z.value} className="chip" aria-pressed={draft.timezone === z.value} onClick={() => set({ timezone: z.value })}>
              {z.label}
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn-primary btn-block" disabled={!changed || !draft.name.trim() || busy} onClick={save}>
        {busy ? "Saving…" : changed ? "Save changes" : "Saved"}
      </button>
    </div>
  );
}
