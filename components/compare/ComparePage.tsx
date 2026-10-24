"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, CircleDashed, Clock, Minus } from "lucide-react";
import { Mascot } from "../ui";

// Public sales page (/compare): price gap by crew size, then features side by side.
// Competitor prices are monthly-billing list prices from public pricing guides, October 2026.
// Keep claims careful: "not a built-in feature we found", never "they can't".

const US = 49;
type Crew = 1 | 3 | 5;

const PRICES: { name: string; plan: Record<Crew, string>; price: Record<Crew, number>; us?: boolean }[] = [
  { name: "My Office Bot", plan: { 1: "Whole crew", 3: "Whole crew", 5: "Whole crew" }, price: { 1: 49, 3: 49, 5: 49 }, us: true },
  { name: "Jobber", plan: { 1: "Core", 3: "Connect", 5: "Connect" }, price: { 1: 49, 3: 139, 5: 139 } },
  { name: "Housecall Pro", plan: { 1: "Basic", 3: "Essentials", 5: "Essentials" }, price: { 1: 79, 3: 189, 5: 189 } },
  { name: "Workiz", plan: { 1: "From", 3: "From", 5: "From" }, price: { 1: 225, 3: 225, 5: 275 } },
  { name: "ServiceTitan", plan: { 1: "From, per tech", 3: "From, per tech", 5: "From, per tech" }, price: { 1: 245, 3: 735, 5: 1225 } },
  { name: "Podium", plan: { 1: "Core", 3: "Core", 5: "Pro" }, price: { 1: 399, 3: 399, 5: 599 } },
];

type Mark = "yes" | "part" | "soon" | "no" | "";
type Cell = [Mark, string?];

const COLUMNS = ["My Office Bot", "Housecall Pro / Jobber", "ServiceTitan / Workiz", "Podium / Hatch"];
const NOT_FOUND = "Not a built-in feature we found*";

const FEATURES: { feature: string; cells: [Cell, Cell, Cell, Cell] }[] = [
  {
    feature: "Alert the moment a website lead comes in",
    cells: [["yes", "Email in seconds. Text alerts coming soon."], ["part", "Alert inside their app"], ["part", "Alert inside their app"], ["yes", "Their main feature"]],
  },
  {
    feature: "Keep the form you already have",
    cells: [
      ["yes", "WordPress plugin for Bricks, Divi, Contact Form 7, WPForms, Gravity Forms and Elementor"],
      ["no", "Use their form, or wire yours up with Zapier"],
      ["no", "Use their form, or wire yours up with Zapier"],
      ["part", "Chat widget or lead-site connections"],
    ],
  },
  {
    feature: "Save the lead to your phone contacts in one tap",
    cells: [["yes", "From the app or the alert email"], ["no", NOT_FOUND], ["no", NOT_FOUND], ["no", NOT_FOUND]],
  },
  {
    feature: "Customer list that spots repeat customers",
    cells: [["yes", "Matched by phone and email automatically"], ["yes"], ["yes"], ["part", "Podium yes"]],
  },
  {
    feature: "Schedule and calendar",
    cells: [["yes", "Appointments, multi-day projects, double-booking check, month view"], ["yes", "Full dispatch and GPS"], ["yes", "Full dispatch"], ["no"]],
  },
  {
    feature: "Crew reminder the evening before",
    cells: [["yes", "Automatic email to the crew"], ["yes", "Through their crew app"], ["yes"], ["no"]],
  },
  {
    feature: "Text the customer back with your own replies",
    cells: [["soon", "Up to 10 of your own quick replies"], ["part", "Some automatic texts"], ["yes"], ["yes", "Their main feature"]],
  },
  {
    feature: "Customers book online",
    cells: [["soon", "Planned"], ["yes"], ["yes"], ["no"]],
  },
  {
    feature: "Estimates, invoices and payments",
    cells: [["no", "Keep the tool you use now"], ["yes"], ["yes"], ["part", "Payments with Podium"]],
  },
  {
    feature: "Review requests",
    cells: [["no"], ["part", "Higher plans"], ["yes"], ["yes", "Podium's specialty"]],
  },
  {
    feature: "Time to get going",
    cells: [["yes", "Minutes"], ["", "Hours to days"], ["", "Weeks to months for ServiceTitan"], ["", "Sales call first"]],
  },
  {
    feature: "Contract",
    cells: [["yes", "Month to month"], ["", "Monthly or yearly"], ["", "Usually yearly"], ["", "Yearly"]],
  },
];

const SOURCES = [
  ["Housecall Pro (Projul)", "https://projul.com/blog/housecall-pro-pricing-analysis-2026"],
  ["Housecall Pro (SchedulingKit)", "https://schedulingkit.com/pricing-guides/housecall-pro-pricing"],
  ["Jobber (OneCrew)", "https://www.getonecrew.com/post/jobber-pricing"],
  ["Jobber (Fieldproxy)", "https://www.fieldproxy.ai/fsm-software-pricing/jobber"],
  ["ServiceTitan (Projul)", "https://projul.com/blog/servicetitan-pricing-analysis-2026"],
  ["ServiceTitan (OneCrew)", "https://www.getonecrew.com/post/servicetitan-pricing"],
  ["Workiz (Fieldproxy)", "https://www.fieldproxy.ai/fsm-software-pricing/workiz"],
  ["Workiz (ServiceAgent)", "https://serviceagent.ai/blogs/workiz-pricing/"],
  ["Podium (Pabau)", "https://pabau.com/blog/podium-pricing/"],
  ["Podium (SocialPilot)", "https://socialpilot.co/blog/podium-pricing/"],
  ["Hatch (PricingSaaS)", "https://pricingsaas.com/companies/usehatch"],
];

const usd = (v: number) => "$" + Math.round(v).toLocaleString("en-US");

const MARK_ICON = { yes: Check, part: CircleDashed, soon: Clock, no: Minus };
const MARK_LABEL = { yes: "Included", part: "Partly, or on higher plans", soon: "Coming soon", no: "Not included" };

function MarkIcon({ mark }: { mark: Exclude<Mark, ""> }) {
  const Icon = MARK_ICON[mark];
  return (
    <span className={`cmp-mark is-${mark}`} role="img" aria-label={MARK_LABEL[mark]}>
      <Icon size={14} strokeWidth={3} />
    </span>
  );
}

export function ComparePage() {
  const [crew, setCrew] = useState<Crew>(3);
  const rows = [...PRICES].sort((a, b) => a.price[crew] - b.price[crew] || (a.us ? -1 : 1));
  const max = Math.max(...rows.map((r) => r.price[crew]));
  const most = Math.max(...PRICES.map((r) => (r.price[crew] - US) * 12));
  const highlights = ["Jobber", "Housecall Pro", "Podium"].map((name) => PRICES.find((r) => r.name === name)!);
  const people = crew === 1 ? "1 person" : `${crew} people`;

  return (
    <main className="cmp-page">
      <div className="cmp-wrap">
        <Link href="/" className="auth-brand" aria-label="My Office Bot home">
          <Mascot size={44} />
          <span className="wordmark">
            My <span className="wordmark-blue">Office</span> Bot
          </span>
        </Link>

        <section className="cmp-hero">
          <p className="cmp-eyebrow">My Office Bot vs. the big names</p>
          <h1>Every website lead on your phone in seconds. One low price for the whole crew.</h1>
          <p className="cmp-lede">
            Housecall Pro, Jobber and ServiceTitan want to run your whole business, and they charge for it. My Office Bot does
            the one job that wins jobs: it makes sure you never miss a lead from your website. It works with the website and
            form you already have.
          </p>
          <div className="cmp-price">
            <p className="cmp-big">
              $49<small> /month per location</small>
            </p>
            <div className="cmp-chips">
              <span>No per-user fees</span>
              <span>No setup fee</span>
              <span>Month to month</span>
              <span>Free during the beta</span>
            </div>
          </div>
          <a className="btn btn-primary cmp-cta" href="/signup">
            Start free <ArrowRight size={20} strokeWidth={2.4} />
          </a>
        </section>

        <section aria-labelledby="cmp-save">
          <p className="cmp-eyebrow">What you keep</p>
          <h2 id="cmp-save">See what your crew saves every month</h2>
          <div className="cmp-panel">
            <div className="cmp-calc-top">
              <div className="cmp-seg" role="group" aria-label="Crew size">
                {([1, 3, 5] as Crew[]).map((n) => (
                  <button key={n} type="button" aria-pressed={crew === n} onClick={() => setCrew(n)}>
                    {n === 1 ? "1 person" : `${n} people`}
                  </button>
                ))}
              </div>
              <p className="cmp-save-line">
                Up to <b>{usd(most)} a year</b> back in your pocket.
              </p>
            </div>
            <div className="cmp-bars" aria-live="polite">
              {rows.map((r) => {
                const v = r.price[crew];
                const gap = v - US;
                return (
                  <div key={r.name} className={`cmp-bar${r.us ? " is-us" : ""}`}>
                    <p className="cmp-bar-name">
                      {r.name}
                      <small>{r.plan[crew]}</small>
                    </p>
                    <div className="cmp-track">
                      <div className="cmp-fill" style={{ width: `${Math.max(1.5, (v / max) * 100)}%` }} />
                    </div>
                    <p className="cmp-bar-val">
                      {usd(v)}/mo
                      <span>{r.us ? "per month" : gap > 0 ? `+${usd(gap * 12)} a year` : "Same price"}</span>
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="cmp-note">
              Monthly prices with monthly billing. Workiz and ServiceTitan show their lowest estimate, and ServiceTitan also
              charges about $5,000 to $50,000 to set up. Hatch only gives prices on a sales call, so it isn&apos;t shown.
            </p>
          </div>
          <div className="cmp-cards">
            {highlights.map((r) => {
              const yr = (r.price[crew] - US) * 12;
              return (
                <div key={r.name} className="cmp-card">
                  <p>Compared with {r.name}</p>
                  <p className="cmp-card-num">{usd(Math.max(0, yr))}</p>
                  <p>{yr > 0 ? `saved every year with ${people}` : "Same price, plus a plugin for the form you already have"}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="cmp-features">
          <p className="cmp-eyebrow">Side by side</p>
          <h2 id="cmp-features">Built for speed to lead, not for paperwork</h2>
          <div className="cmp-legend">
            {(["yes", "part", "soon", "no"] as const).map((m) => (
              <span key={m}>
                <MarkIcon mark={m} />
                {MARK_LABEL[m]}
              </span>
            ))}
          </div>
          <div className="cmp-table-box">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  {COLUMNS.map((c, i) => (
                    <th key={c} scope="col" className={i === 0 ? "is-us" : undefined}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURES.map(({ feature, cells }) => (
                  <tr key={feature}>
                    <th scope="row">{feature}</th>
                    {cells.map(([mark, note], i) => (
                      <td key={i} className={i === 0 ? "is-us" : undefined}>
                        <span className="cmp-cell">
                          {mark && <MarkIcon mark={mark} />}
                          {note && <span>{note}</span>}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cmp-note">
            * Based on each company&apos;s public pages and help articles as of October 2026. If we got something wrong, email{" "}
            <a href="mailto:support@myofficebot.app">support@myofficebot.app</a> and we&apos;ll fix it.
          </p>
        </section>

        <section className="cmp-keep" aria-labelledby="cmp-keep">
          <h2 id="cmp-keep">Already on Jobber or Housecall Pro? Keep it.</h2>
          <p className="cmp-lede">
            My Office Bot isn&apos;t trying to replace your invoicing or dispatch. It sits in front of them and makes sure no
            lead from your website sits unanswered while you&apos;re on a roof or under a sink. Most contractors lose jobs
            because the lead waited, not because the invoice looked plain.
          </p>
          <a className="btn btn-primary cmp-cta" href="/signup">
            Try it free during the beta <ArrowRight size={20} strokeWidth={2.4} />
          </a>
        </section>

        <footer className="cmp-foot">
          <p>
            Competitor prices are list prices for monthly billing from public pricing pages and third-party pricing guides as
            of October 2026. Prices change, and yearly plans or negotiated deals can be lower. My Office Bot&apos;s $49 is our
            planned price after the free beta. Product names belong to their owners. My Office Bot isn&apos;t affiliated with
            any company named here.
          </p>
          <p>
            Sources:{" "}
            {SOURCES.map(([label, href], i) => (
              <span key={href}>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
                {i < SOURCES.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>
          <p className="cmp-foot-links">
            <Link href="/">Home</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> ·{" "}
            <Link href="/login">Sign in</Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
