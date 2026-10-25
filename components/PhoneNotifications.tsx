"use client";

import { useEffect, useState } from "react";
import { BellRing, Send, Share, SquarePlus } from "lucide-react";
import { useAccount } from "@/lib/account";
import { isIOS, pushState, turnOffPush, turnOnPush, type PushState } from "@/lib/pushClient";
import { sendTestPush } from "@/app/app/actions";
import { Toggle } from "./ui";

// "Phone notifications" (D63): a pop-up on this phone for every new lead. Each person turns it on
// on their own phone; it's free and isn't texting. On iPhone the app has to be on the Home Screen first.

export function PhoneNotifications({ onToast }: { onToast: (text: string, error?: boolean) => void }) {
  const { live } = useAccount();
  const [state, setState] = useState<PushState | "loading">("loading");
  const [endpoint, setEndpoint] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!live) return setState("off");
    pushState()
      .then((s) => {
        setState(s.state);
        setEndpoint(s.endpoint);
      })
      .catch(() => setState("unsupported"));
  }, [live]);

  const toggle = async (on: boolean) => {
    if (!live) return onToast("Create your account to get lead pop-ups on your phone");
    setBusy(true);
    if (on) {
      const r = await turnOnPush();
      setState(r.state);
      setEndpoint(r.endpoint);
      if (r.error) onToast(r.error, true);
      else if (r.state === "on") onToast("Notifications are on for this phone");
      else if (r.state === "blocked") onToast("Notifications are blocked. Allow them in your phone's settings.", true);
    } else {
      setState(await turnOffPush().catch(() => "off" as const));
      setEndpoint(undefined);
      onToast("Notifications are off for this phone");
    }
    setBusy(false);
  };

  const test = async () => {
    if (!endpoint) return;
    setBusy(true);
    const r = await sendTestPush(endpoint);
    setBusy(false);
    onToast(r.ok ? "Test sent. It should pop up in a few seconds." : (r.error ?? "Couldn't send a test"), !r.ok);
  };

  const on = state === "on";
  return (
    <div className="card pad push-card">
      <div className="push-top">
        <span className="icon-circle">
          <BellRing size={24} strokeWidth={2.4} />
        </span>
        <div className="push-text">
          <p className="card-lead">Phone notifications</p>
          <p className="muted">
            {on ? "On for this phone. New leads pop up here within seconds." : "Get a pop-up on this phone the second a lead comes in. Free, no texts."}
          </p>
        </div>
        {(state === "on" || state === "off") && (
          <Toggle checked={on} onChange={(v) => !busy && void toggle(v)} label="Phone notifications for this phone" />
        )}
      </div>

      {state === "install-first" && (
        <ol className="push-steps">
          <li>
            Tap <Share size={18} strokeWidth={2.4} className="inline-ico" aria-label="Share" /> at the bottom of Safari.
          </li>
          <li>
            Choose <b>Add to Home Screen</b> <SquarePlus size={18} strokeWidth={2.4} className="inline-ico" aria-hidden />.
          </li>
          <li>Open My Office Bot from your Home Screen and turn notifications on here.</li>
        </ol>
      )}
      {state === "blocked" && (
        <p className="push-note">
          Notifications are blocked for My Office Bot on this {isIOS() ? "iPhone" : "device"}. Turn them on in your phone&apos;s
          settings (Notifications → My Office Bot), then come back here.
        </p>
      )}
      {state === "unsupported" && (
        <p className="push-note">This browser can&apos;t show notifications. Use Chrome on Android, or add the app to your iPhone&apos;s Home Screen.</p>
      )}
      {on && (
        <button className="btn btn-soft btn-block" onClick={test} disabled={busy}>
          <Send size={20} strokeWidth={2.4} /> {busy ? "Sending…" : "Send a test notification"}
        </button>
      )}
    </div>
  );
}
