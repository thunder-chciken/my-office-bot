"use client";

import { Code2, Copy, Inbox, Send, Webhook } from "lucide-react";
import { business } from "@/lib/data";
import { Header, SectionTitle } from "./ui";

const connectOptions = [
  {
    Icon: Code2,
    title: "Add one line to your site",
    body: "Works with any form. Paste it before </body>.",
    value: `<script src="https://myofficebot.app/f.js" data-account="${business.accountId}" async></script>`,
  },
  {
    Icon: Inbox,
    title: "Or forward your form emails",
    body: "Already get form emails? Forward them here.",
    value: `leads-${business.accountId}@in.myofficebot.app`,
  },
  {
    Icon: Webhook,
    title: "Or use a webhook",
    body: "For WordPress, Bricks, Gravity Forms, Zapier.",
    value: `https://myofficebot.app/api/leads/${business.accountId}`,
  },
];

export function WebsiteScreen({
  onCopy,
  onTestLead,
}: {
  onCopy: (text: string) => void;
  onTestLead: () => void;
}) {
  return (
    <>
      <Header title="Website" subtitle="Where your leads come from" />

      <div className="card pad status-card">
        <span className="live-dot" aria-hidden />
        <div>
          <p className="card-lead">Connected</p>
          <p className="status-site">{business.website}</p>
          <p className="muted">New leads reach your phone in about 2 seconds.</p>
        </div>
      </div>

      <button className="btn btn-primary btn-block btn-xl" onClick={onTestLead}>
        <Send size={24} strokeWidth={2.4} /> Send a test lead
      </button>

      <SectionTitle>Connect a form</SectionTitle>
      <div className="stack">
        {connectOptions.map(({ Icon, title, body, value }) => (
          <div key={title} className="card pad">
            <div className="connect-top">
              <span className="icon-circle">
                <Icon size={24} strokeWidth={2.4} />
              </span>
              <div>
                <p className="card-lead">{title}</p>
                <p className="muted">{body}</p>
              </div>
            </div>
            <div className="copy-box">
              <code>{value}</code>
            </div>
            <button className="btn btn-soft btn-block" onClick={() => onCopy(value)}>
              <Copy size={22} strokeWidth={2.4} /> Copy
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
