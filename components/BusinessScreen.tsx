"use client";

import { useState } from "react";
import { Check, ChevronRight, Droplet, Grid3x3, Hammer, Home, LifeBuoy, LogOut, Wind, Zap, CreditCard } from "lucide-react";
import { business, initials } from "@/lib/data";
import { Header, SectionTitle } from "./ui";

const trades = [
  { name: "Roofing", Icon: Home },
  { name: "HVAC", Icon: Wind },
  { name: "Remodeling", Icon: Hammer },
  { name: "Tile", Icon: Grid3x3 },
  { name: "Plumbing", Icon: Droplet },
  { name: "Electrical", Icon: Zap },
];

export function BusinessScreen({ stats }: { stats: { leads: number; reply: string; booked: number } }) {
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
