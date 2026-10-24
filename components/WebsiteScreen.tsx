"use client";

import { Code2, Copy, Inbox, Send, Webhook } from "lucide-react";
import { business } from "@/lib/data";
import { useAccount } from "@/lib/account";
import { Header, SectionTitle } from "./ui";

const demoOptions = [
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

// A signed-in business's real ways in: its own form key.
function liveOptions(siteKey: string) {
  const endpoint = `https://myofficebot.app/api/v1/forms/${siteKey}`;
  return [
    {
      Icon: Webhook,
      title: "Send your form here",
      body: "Set your website form's action (or webhook URL) to this address. Works with WordPress, Bricks, Gravity Forms and Zapier.",
      value: endpoint,
    },
    {
      Icon: Code2,
      title: "Or paste a ready-made form",
      body: "A simple contact form that sends straight to you.",
      value: `<form action="${endpoint}" method="POST">
  <input name="name" placeholder="Name" required>
  <input name="phone" placeholder="Phone">
  <input name="email" type="email" placeholder="Email">
  <textarea name="message" placeholder="How can we help?"></textarea>
  <input name="website" style="display:none" tabindex="-1" autocomplete="off">
  <button>Send</button>
</form>`,
    },
  ];
}

export function WebsiteScreen({
  onCopy,
  onTestLead,
}: {
  onCopy: (text: string) => void;
  onTestLead: () => void;
}) {
  const account = useAccount();
  const connectOptions = account.live ? (account.siteKey ? liveOptions(account.siteKey) : []) : demoOptions;
  return (
    <>
      <Header title="Website" subtitle="Where your leads come from" />

      <div className="card pad status-card">
        <span className="live-dot" aria-hidden />
        <div>
          <p className="card-lead">{account.live ? "Ready for leads" : "Connected"}</p>
          <p className="status-site">{account.live ? account.website || "Your website" : business.website}</p>
          <p className="muted">
            {account.live ? "New leads email you within seconds." : "New leads reach your phone in about 2 seconds."}
          </p>
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
