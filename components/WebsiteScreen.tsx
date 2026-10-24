"use client";

import { useState } from "react";
import { Code2, Copy, Download, Eye, EyeOff, PlugZap, RefreshCw, Send, Webhook } from "lucide-react";
import { business, timeAgo } from "@/lib/data";
import { useAccount } from "@/lib/account";
import { browserClient } from "@/lib/supabase/client";
import { Header, SectionTitle } from "./ui";

// Other websites: the site's own form posts straight to its form address, or use our ready-made form.
function formOptions(siteKey: string) {
  const endpoint = `https://myofficebot.app/api/v1/forms/${siteKey}`;
  return [
    {
      Icon: Webhook,
      title: "Not WordPress? Send your form here",
      body: "Set your website form's action (or webhook URL, e.g. Zapier) to this address.",
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
  const [code, setCode] = useState(account.pluginCode);
  const [shown, setShown] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const connectOptions = formOptions(account.live ? (account.siteKey ?? "") : "demo-form-key");
  const lastSeen = account.pluginLastSeen ? Math.max(0, Math.round((Date.now() - new Date(account.pluginLastSeen).getTime()) / 60000)) : null;

  // A new code if the old one was shared by mistake; the plugin needs the new one pasted in.
  const newCode = async () => {
    if (!armed) return setArmed(true);
    setArmed(false);
    setBusy(true);
    const { data, error } = await browserClient().rpc("rotate_plugin_secret");
    setBusy(false);
    if (!error && typeof data === "string" && account.siteKey) {
      setCode(`MOB1.${account.siteKey}.${data}`);
      setShown(true);
    }
  };

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

      <SectionTitle>Connect your website</SectionTitle>
      <div className="card pad wp-card">
        <div className="connect-top">
          <span className="icon-circle">
            <PlugZap size={24} strokeWidth={2.4} />
          </span>
          <div>
            <p className="card-lead">WordPress: keep the form you already have</p>
            <p className="muted">Bricks, Divi, Contact Form 7, WPForms, Gravity Forms and Elementor. Nothing about your form changes.</p>
          </div>
        </div>

        {account.live && (
          <p className={`wp-status${lastSeen != null ? " is-on" : ""}`}>
            {lastSeen != null
              ? `Plugin connected${account.pluginSiteUrl ? ` · ${account.pluginSiteUrl.replace(/^https?:\/\//, "")}` : ""} · last heard from ${timeAgo(lastSeen).toLowerCase()}`
              : "Plugin not connected yet"}
          </p>
        )}

        <ol className="wp-steps">
          <li>Download the plugin and upload it in WordPress: Plugins → Add New → Upload Plugin, then Activate.</li>
          <li>In WordPress, open Settings → My Office Bot and paste your connection code below. Click Save and test.</li>
          <li>Send a test from your contact form. It shows up here in Leads.</li>
          <li>Optional: turn on the chat bubble on the same settings page, a &ldquo;Get a quote&rdquo; button in your brand color on every page.</li>
        </ol>

        <a className="btn btn-primary btn-block" href="/downloads/my-office-bot-wordpress.zip" download>
          <Download size={22} strokeWidth={2.4} /> Download the WordPress plugin
        </a>

        {account.live ? (
          code ? (
            <>
              <p className="field-label">Your connection code (keep it private, like a password)</p>
              <div className="copy-box">
                <code>{shown ? code : `MOB1.${"•".repeat(24)}`}</code>
              </div>
              <div className="btn-row">
                <button className="btn btn-soft" onClick={() => onCopy(code)}>
                  <Copy size={20} strokeWidth={2.4} /> Copy code
                </button>
                <button className="btn btn-soft" onClick={() => setShown((s) => !s)}>
                  {shown ? <EyeOff size={20} strokeWidth={2.4} /> : <Eye size={20} strokeWidth={2.4} />} {shown ? "Hide" : "Show"}
                </button>
              </div>
              <button className={`text-btn wp-rotate${armed ? " is-armed" : ""}`} onClick={newCode} disabled={busy}>
                <RefreshCw size={18} strokeWidth={2.4} />{" "}
                {busy ? "Making a new code…" : armed ? "Tap again: the old code stops working" : "Make a new code"}
              </button>
            </>
          ) : (
            <p className="muted">Your connection code appears here once your website is set up.</p>
          )
        ) : (
          <p className="muted">Create your account to get your own connection code.</p>
        )}
      </div>

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
