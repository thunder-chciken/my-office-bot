# Invisible Office — Stack & Hosting Plan

Goal: a website lead reaches the right people's phones in seconds, by text, email or a phone call, and **never gets lost**. Reliability matters more than anything else, so the stack is built around a durable job queue and providers with delivery receipts.

## Recommended stack

| Layer | Pick | Why |
| --- | --- | --- |
| App (UI + API) | **Next.js** (this repo) | One codebase for the phone app and the webhook API. |
| Hosting | **Vercel** | Push to GitHub = deploy. Preview URL for every branch. API routes run as serverless functions. |
| Code | **GitHub** — `thunder-chciken/Invisible-office` | Vercel deploys `main` automatically. |
| Database + login | **Supabase** (Postgres) | Leads, contacts, accounts. Login by text code or email link (no passwords for crews to forget). Realtime updates the inbox live. Row-level security keeps each business's data separate. |
| Texts + phone calls | **Twilio** (Programmable Messaging + Voice) | Industry standard, delivery receipts, text-to-speech calls ("New lead: Dana, roof leak. Press 1 to call her now."). |
| Email | **Resend** | Simple API, good deliverability, React email templates. |
| Reliable delivery | **Inngest** (or Upstash QStash) | Every alert runs as a durable job with automatic retries, and handles "call the owner if nobody replies in 5 min". Vercel functions alone can't wait 5 minutes or retry safely. |
| Push notifications | **Web Push** (PWA) | Free, instant; works on iPhone when the app is added to the Home Screen (iOS 16.4+). |
| Payments | **Stripe Billing** | Subscriptions, free trial, customer portal. |
| Errors / uptime | **Sentry** + **Better Stack** | Get paged if alerts stop sending. |

## How a lead flows

```
Website form ──► POST /api/leads/{accountId}      (embed script, webhook, or forwarded email)
                    │  validate, detect emergency words, save to Supabase
                    ▼
               Inngest job "lead/received"
                    ├─► Twilio SMS   → each contact with Text on
                    ├─► Resend email → each contact with Email on
                    ├─► Web push     → everyone signed in to the app
                    ├─► Twilio Voice → immediately if urgent ("leak", "no heat")
                    └─► wait N minutes → nobody replied? → Twilio Voice call to owner
```

Every step is logged on the lead ("Texted Matt ✓, Called Matt — no answer"), which is the **Alert history** shown in the app.

## Three ways to capture leads

1. **One-line embed script** — listens for any form submit on the contractor's site and forwards it. Works with almost every site builder.
2. **Email forwarding** — `leads-{id}@in.invisibleoffice.app`. Zero setup for contractors who already get form emails. (Resend or Postmark inbound parsing.)
3. **Webhook** — for WordPress form plugins (Gravity Forms, WPForms, Contact Form 7, Bricks forms), Webflow, Wix and Zapier. The API already maps their common field names.

## Must-do before launch: texting registration (US)

Business texts in the US must be sent from a number registered under **A2P 10DLC** (brand + campaign registration through Twilio). Without it, carriers filter or block texts — the #1 reason lead-alert apps "randomly" stop working. Plan 1–3 weeks for approval. A toll-free number with verification is the alternative.

Also: get each contact's consent to receive alert texts and calls (a checkbox when adding a person), and support STOP replies (Twilio does this automatically).

## Rough monthly cost to start

These are ballpark list prices — check each provider's pricing page before budgeting.

| Item | Approx. |
| --- | --- |
| Vercel Pro | $20 / seat |
| Supabase Pro | $25 |
| Twilio phone number | ~$1–2 per number |
| Twilio SMS (US) | ~1¢ per text segment plus carrier fees |
| Twilio voice calls | ~1–2¢ per minute |
| 10DLC registration | one-time brand/campaign fees plus a small monthly campaign fee |
| Resend | free tier, then ~$20 |
| Inngest | free tier covers early usage |

A contractor getting 100 leads a month with 3 contacts alerted costs well under $10 in messaging.

## Native app later?

Start as an installable web app (PWA): fastest to ship, one codebase, no App Store review. If customers want App Store presence or stronger background alerts, wrap the same UI with **Capacitor** or rebuild the screens in **Expo (React Native)** — the API, database and alert engine stay the same.

## Build order

1. Connect this repo to Vercel (import from GitHub, no config needed).
2. Supabase: tables `accounts`, `contacts`, `leads`, `alert_events`; phone/email login.
3. Wire `/api/leads/[accountId]` to save leads and send the Inngest event.
4. Twilio SMS + Resend email alerts (start 10DLC registration on day one).
5. Escalation calls + emergency-word calls.
6. Web push + "Add to Home Screen" onboarding.
7. Embed script and inbound email.
8. Stripe trial + billing.
