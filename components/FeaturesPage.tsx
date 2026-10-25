import Link from "next/link";
import { ArrowRight, BellRing, CalendarDays, Globe, MessageSquare, Smartphone, Users, type LucideIcon } from "lucide-react";
import { Mascot } from "./ui";

// Public "What it does" page (/features). No comparisons with anyone else: My Office Bot stands on its own as the
// simple, fast way to answer every website lead before the customer moves on.

const GROUPS: { Icon: LucideIcon; title: string; items: string[] }[] = [
  {
    Icon: Globe,
    title: "Catches every lead",
    items: [
      "Works with the website and form you already have. Nothing to rebuild.",
      "WordPress plugin for Bricks, Divi, Elementor, WPForms, Gravity Forms, Contact Form 7 and Fluent Forms.",
      "A form address for any other website.",
      "Optional “Get a quote” chat bubble in your colors, with your logo.",
      "Spam traps keep the junk out.",
    ],
  },
  {
    Icon: BellRing,
    title: "Tells you in seconds",
    items: [
      "A pop-up on your phone the second a lead comes in.",
      "An email to everyone on your team, with Call, Text and Save contact buttons.",
      "A second reminder if nobody’s on it after the time you pick.",
    ],
  },
  {
    Icon: MessageSquare,
    title: "Lets you reply in one tap",
    items: [
      "Tap the pop-up and you’re looking at your quick replies.",
      "Up to 10 quick text replies in your own words, with their first name filled in.",
      "One tap to Call, Text, Email or get Directions.",
      "An instant “we got your request” email to the homeowner, in your words.",
    ],
  },
  {
    Icon: Users,
    title: "Keeps the crew on the same page",
    items: [
      "“I’m on it”: one tap claims a lead, so nobody doubles up. Hand it off anytime.",
      "Waiting timers go green, yellow, red, so nothing sits.",
      "Notes on every lead, and a history of who heard about it and when.",
    ],
  },
  {
    Icon: CalendarDays,
    title: "Keeps you organized",
    items: [
      "Every homeowner saved as a customer automatically, with no duplicates.",
      "Schedule visits and multi-day jobs, with double-booking checks.",
      "The crew gets an email the evening before with tomorrow’s stops.",
      "Save any lead to your phone’s contacts.",
    ],
  },
  {
    Icon: Smartphone,
    title: "Works wherever you are",
    items: [
      "Installs on your phone like an app, iPhone or Android.",
      "A full dashboard on your computer.",
      "Set up in minutes.",
    ],
  },
];

export function FeaturesPage() {
  return (
    <main className="feat-page">
      <div className="feat-wrap">
        <Link href="/" className="auth-brand" aria-label="My Office Bot home">
          <Mascot size={44} />
          <span className="wordmark">
            My <span className="wordmark-blue">Office</span> Bot
          </span>
        </Link>

        <section className="feat-hero">
          <p className="feat-eyebrow">Instant replies for contractors</p>
          <h1>Answer every lead in seconds, before they move on down the road.</h1>
          <p className="feat-lede">
            People want an answer now. If they don&apos;t hear back fast, they call the next guy. My Office Bot puts every
            website lead on your phone the second it comes in, and lets you reply with one tap.
          </p>
          <p className="feat-motto">Simple. Fast. Done right.</p>
          <div className="feat-price">
            <p className="feat-big">
              $49<small> /month per location</small>
            </p>
            <div className="feat-chips">
              <span>Whole crew included</span>
              <span>No setup fee</span>
              <span>Month to month</span>
              <span>Free during the beta</span>
            </div>
          </div>
          <a className="btn btn-primary feat-cta" href="/signup">
            Start free <ArrowRight size={20} strokeWidth={2.4} />
          </a>
        </section>

        <section aria-labelledby="feat-list">
          <p className="feat-eyebrow">What it does</p>
          <h2 id="feat-list">Everything you need to get back to a customer first</h2>
          <div className="feat-grid">
            {GROUPS.map(({ Icon, title, items }) => (
              <div key={title} className="feat-card">
                <span className="feat-icon" aria-hidden>
                  <Icon size={24} strokeWidth={2.3} />
                </span>
                <h3>{title}</h3>
                <ul>
                  {items.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="feat-close" aria-labelledby="feat-close">
          <h2 id="feat-close">One job, done well.</h2>
          <p className="feat-lede">
            My Office Bot does one thing: it gets you back to your customer first. No bloat, nothing to learn. Your leads
            come in, your phone lights up, you reply, you win the job.
          </p>
          <a className="btn btn-primary feat-cta" href="/signup">
            Try it free during the beta <ArrowRight size={20} strokeWidth={2.4} />
          </a>
        </section>

        <footer className="feat-foot">
          <p>$49 a month per location is our planned price after the free beta.</p>
          <p className="feat-foot-links">
            <Link href="/">Home</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> ·{" "}
            <Link href="/login">Sign in</Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
