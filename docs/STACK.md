# Invisible Office — Stack & Hosting Plan

Goal: a website lead reaches the right people's phones in seconds, by text, email or a phone call, and **never gets lost**. Reliability matters more than anything else, so the whole system is built around a database ledger of every alert, with delivery receipts.

Full implementation contract: [SPEC.md](SPEC.md). Settled choices: [DECISIONS.md](DECISIONS.md).

## Stack

| Layer | Pick | Why |
| --- | --- | --- |
| App (UI + API) | **Next.js** (this repo) | One codebase for the phone app and the intake/webhook API. |
| Hosting | **Vercel Pro** | Push to GitHub = deploy, with a preview URL per branch. Pro is required for per-minute cron. |
| Code | **GitHub** — `thunder-chciken/Invisible-office` | Vercel deploys `main` automatically. |
| Database, login, scheduler | **Supabase** (Postgres + Auth + RLS + pg_cron) | Leads, contacts, the alert ledger and the escalation scheduler all live in Postgres. Login by text code or email link. Row-level security keeps each business's data separate. |
| Texts + phone calls | **Twilio** (Messaging + Voice) | Delivery receipts, press-1 acknowledgment on calls, STOP/HELP handling. |
| Email | **Resend** | Alerts, homeowner confirmations, weekly reports; inbound parsing for forwarded form emails (or Postmark). |
| Spam | **Cloudflare Turnstile** + risk scoring | Fake leads must never trigger escalation calls. |
| Payments | **Stripe Billing** | One plan, 14-day trial. |
| Monitoring | **Better Stack** + Sentry | Get paged if alerts stop going out. |

No separate workflow engine in v1: Postgres is the scheduler (see SPEC §9).

## How a lead flows

```
WordPress plugin / forwarded email / widget
        │  signed request
        ▼
POST /api/v1/intake  → normalize → dedupe → spam score → save lead + "received" event
        │
        ▼
notification_attempts rows (step 0 now, reminder 2 min, call 5 min, backup 7 min)
        │
step 0 is dispatched immediately by the intake handler;
pg_cron every minute (Vercel Cron as backup) → /api/cron/dispatch
        │  claims due rows (reminders, calls, retries), re-checks the lead, sends
        ├─► Twilio SMS   → contacts with Text on   ("Reply 1 to take it")
        ├─► Resend email → contacts with Email on  (+ homeowner confirmation)
        ├─► Twilio Voice → at 5 min if nobody acknowledged ("Press 1")
        └─► backup contacts at 7 min (only those who replied YES)

Acknowledge (press 1 / reply 1 / rescue link / app) → cancels the rest of the ladder
```

Every step is an event on the lead, which is the **Alert history** in the app and the source of the weekly report.

## Must-do before launch: texting registration (US)

Business texts in the US must come from a number registered under **A2P 10DLC**. Without it, carriers filter or block texts, which is the #1 reason lead-alert apps "randomly" stop working.

- Invisible Office registers **one brand** (needs a legal entity + EIN) and an "Account Notification" campaign for alerts to contractors and their staff. Plan 1–3 weeks; email alerts cover the gap.
- **Texts to homeowners are not in v1.** Sending on each contractor's behalf would require registering every contractor as its own brand. Homeowners get email confirmations instead.
- Every person who receives alerts opts in (signup checkbox; backup contacts reply YES). STOP is honored automatically.

## Rough monthly cost to start

Full, current model: [COSTS.md](COSTS.md). It supersedes this section.

Ballpark list prices; check each provider's pricing page before budgeting.

| Item | Approx. |
| --- | --- |
| Vercel Pro | $20 / seat |
| Supabase Pro | $25 |
| Twilio phone number | ~$1–2 per number |
| Twilio SMS (US) | ~$0.0083 per segment + ~$0.003–0.005 carrier fee |
| Twilio voice | ~$0.014 per minute outbound |
| 10DLC registration | one-time brand/campaign fees + small monthly campaign fee |
| Resend | free tier, then ~$20 |
| Better Stack / Sentry | free tiers to start |

A contractor with 100 leads a month and 3 contacts costs roughly $5 in messaging. Price: $49 / location / month ($29 wholesale for agencies).

## Native app later?

Start as an installable web app (add to Home Screen), with alerts by SMS, call and email, so no app install is needed. If customers want App Store presence, wrap the same UI with **Capacitor** or rebuild the screens in **Expo**; the API, database and alert engine stay the same.

## Build order

See SPEC §18:
1. **Truth Engine:** schema, auth, RLS, WordPress plugin, signed intake, spam quarantine. One real form → exactly one lead.
2. **Response Engine:** SMS/email/voice, the dispatcher, acknowledgment, the escalation ladder, quiet hours, backup consent, compliance gates.
3. **Accountability Engine:** real data in the UI, timeline, integration health, weekly report, Stripe, agency switcher.
