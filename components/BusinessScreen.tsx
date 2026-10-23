"use client";

import { useState } from "react";
import { Check, ChevronRight, Droplet, Grid3x3, Hammer, Home, LifeBuoy, LogOut, Wind, Zap, CreditCard } from "lucide-react";
import { business, initials } from "@/lib/data";
import type { TestTarget } from "@/lib/contact";
import { Header, SectionTitle } from "./ui";

const trades = [
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
}: {
  stats: { leads: number; reply: string; booked: number };
  test: TestTarget;
  onTestChange: (t: TestTarget) => void;
}) {
  const [selected, setSelected] = useState<string[]>(["Roofing", "Remodeling", "Tile"]);
  const toggle = (t: string) =>
    setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  return (
    <>
      <Header title="Business" />

      <div className="card pad profile">
        <span className="logo-tile">{initials(business.name)}</span>
        <div>
          <p className="card-lead">{business.name}</p>
          <p className="muted">{business.city}</p>
        </div>
      </div>

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
        {trades.map(({ name, Icon }) => {
          const on = selected.includes(name);
          return (
            <button key={name} className="trade" aria-pressed={on} onClick={() => toggle(name)}>
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
          The sample customers have fake numbers. Put yours here and Call, Text and Email on any lead will go to
          you instead. Saved on this phone only.
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
              <span className="muted">Pro trial · 12 days left</span>
            </span>
            <ChevronRight size={22} className="chev" />
          </button>
        </li>
        <li>
          <button className="row row-btn">
            <LifeBuoy size={22} className="row-icon" />
            <span className="row-text">Help &amp; support</span>
            <ChevronRight size={22} className="chev" />
          </button>
        </li>
        <li>
          <button className="row row-btn is-danger">
            <LogOut size={22} className="row-icon" />
            <span className="row-text">Sign out</span>
          </button>
        </li>
      </ul>
    </>
  );
}
