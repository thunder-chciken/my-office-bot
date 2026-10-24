# Decision Log

Settled choices, so we don't reopen them every session. To change one, add a new entry that supersedes it. Don't edit history.

Agreed between Claude and ChatGPT in R&D rounds 001–004 on 2026-10-23, with Matt's direction.

| # | Decision | Why |
| --- | --- | --- |
| D1 | **Product = lead-response accountability**, not a chat widget. | Competitors (HighLevel, Housecall Pro, Podium) already have widgets and alerts. We win on setup speed, the escalation ladder, and proof of response. |
| D2 | **North-star metric:** % of legitimate leads acknowledged within 5 minutes. | It measures whether the promise is kept. |
| D3 | **No homeowner SMS in v1.** Homeowners get on-screen + email confirmation. Branded homeowner SMS comes later as a paid add-on with per-contractor 10DLC registration. | Texting on a contractor's behalf needs a per-contractor brand/campaign under Twilio's ISV model (fees, EIN vetting, weeks of approval). |
| D4 | **No live chat in v1.** The widget is async: estimate form, text us, call us. | Contractors can't answer chat in real time; an unanswered chat is worse than a form. |
| D5 | **Capture existing forms first:** WordPress plugin hooks → email forwarding → native widget. A generic listener script comes later as "best effort". | Least friction for sites that already have forms; server-side hooks only fire on successful submits. |
| D6 | **Stack:** Next.js on Vercel Pro + Supabase (Postgres, Auth, RLS, pg_cron) + Twilio + Resend. | One codebase, few moving parts. Vercel Pro is needed for per-minute cron. |
| D7 | **Postgres is the scheduler; no Inngest in v1.** An attempts ledger with leases, `FOR UPDATE SKIP LOCKED`, pg_cron primary trigger, Vercel Cron backup trigger, plus a reconciler. | State is inspectable in SQL, recovery is predictable, and we needed a reconciler anyway. |
| D8 | **Only authenticated human actions acknowledge a lead:** press 1, reply `1` from a known number, the rescue link, or the in-app button. | Delivered, answered and voicemail are not responsibility. |
| D9 | **Delivery policy:** alerts are at-least-once; voice is at-most-once per step, with uncertain outcomes reconciled. | A duplicate alert is cheap; a duplicate call is annoying; a missed alert is fatal. |
| D10 | **Accepted limitation:** an ack during dispatch may still cause one ring; the TwiML late-check ends the call. | It can't be fully prevented once the provider request is sent. |
| D11 | **Four lead states:** Received / Notified / Acknowledged / Contacted, with contact labeled self-reported vs system-verified. "Contacted" doesn't silently stop escalation. | Keeps the accountability metric honest. |
| D12 | **Spam is quarantined, never discarded**; voice escalation only for leads that pass. | False negatives cost jobs; fake 2am calls cost customers. |
| D13 | **Duplicates:** transport idempotency (event id / Message-ID) plus semantic linking. A second different or more urgent request is never suppressed. | Two requests in 10 minutes can be two real problems. |
| D14 | **Night calls are opt-in**; quiet hours default 21:00–07:00. | Respect the contractor's life; avoid uninstalls. |
| D15 | **Backup contacts must reply YES** before any text or call. | Consent evidence for every recipient. |
| D16 | **SMS activation is a state machine**, and the UI never promises channels that aren't active. | Carrier approval takes weeks; email covers the gap. |
| D17 | **Pricing:** one plan, $49 / location / month, escalation included; agency wholesale $29 / location. Fair-use limits on SMS and voice. No tiers until usage data justifies them. | Escalation is the product; tiers split a small first market. |
| D18 | **Go-to-market:** agencies, starting with Matt's own WordPress/Bricks clients as 3 design partners. White-label later. | Matt already builds contractor sites; it's the fastest path to real usage. |
| D19 | **Name:** Invisible Office (over GhostOffice). Trademark and domain clearance still required. | Room to grow beyond alerts; GhostOffice reads as a novelty. |
| D20 | **Emergency engine v1 = configurable keyword signals per trade.** LLM classification and summaries come later. | Reliable before intelligent. |

## Review 005 (ChatGPT spec review, 2026-10-23): verdict "keep the architecture, tighten the contract"

| # | Decision | Why |
| --- | --- | --- |
| D21 | **SMS acknowledgment uses a per-lead 4-digit code** ("Reply 4821"). A bare `1` is accepted only when exactly one eligible lead is open for that contact; otherwise we ask, never guess. *Refines D8.* | "Most recent lead" acknowledges the wrong lead when several arrive together. |
| D22 | **One dispatch path.** No direct-from-database send fallback. pg_cron and Vercel Cron both trigger the same dispatcher. *Supersedes the stretch idea in SPEC v1 §3.* | A second send path would bypass consent, quiet-hours and ack checks. |
| D23 | **One eligibility predicate, checked at claim and inside the dispatch transaction**: lead state, ladder active, quarantine, contact consent/opt-out/toggles, account billing + channel status, quiet hours in the IANA timezone. | Settings change after attempts are queued. |
| D24 | **Fenced claims; recovery depends on the last durable state.** `dispatching` never returns to `pending`; it becomes `uncertain` and is reconciled. Stale workers can't dispatch. | Prevents duplicate calls after crashes. We promise one claim owner, not exactly-once delivery. |
| D25 | **STOP blocks SMS and voice** to that number; email is unaffected. | Consistent, conservative opt-out. |
| D26 | **Rescue links:** GET is side-effect-free and swaps the token for a scoped cookie; limited fields; actions are POST + CSRF; no third-party scripts. | Link scanners, forwarding and referrer leaks. |
| D27 | **Forwarded email needs sender trust**: unknown or unauthenticated senders → `needs_review`, never a ladder. The forwarding address uses a random rotatable token. | Anyone who learns the address could otherwise trigger calls. |
| D28 | **Tenant isolation is database-enforced**: composite FKs with `account_id`, per-command RLS policies, minimal grants, `security definer` functions in a private schema, role changes only via an RPC. | RLS on `account_id` alone doesn't stop cross-tenant references. |
| D29 | **Provider callbacks are matched by provider SID** and only move forward by rank; terminal attempts never reopen. | Replayed or late callbacks can't corrupt state. |
| D30 | **Billing never silently disables alerts**: past_due keeps the full ladder; suspended = email-only with notices; canceled after notices. | Losing alerts silently would break the core promise. |
| D31 | **Metric definition fixed** (SPEC §16): eligible population, clock start (received / released / end of quiet hours), duplicates excluded, policy printed on the report. | Keeps the north-star metric honest and comparable. |

## R&D 007–008 (hosting, costs, growth, 2026-10-23)

| # | Decision | Why |
| --- | --- | --- |
| D32 | **Host on Vercel Pro.** Netlify Pro is an acceptable alternative with no reason to migrate. Vercel Hobby and Netlify Free are not allowed (non-commercial terms; free sites pause when credits run out). | The app is already Next.js on Vercel; a paused or non-compliant host would lose leads. |
| D33 | **Budget the pilot at $100–150/month** fixed, plus ~$2.2–4.4k one-time setup (see COSTS.md). | Room for small overages and incidental tools. |
| D34 | **Cost model has three scenarios**: lean $0.07, expected $0.12, stress $0.28 per lead. Replace them with measured numbers after 10 contractors. | One optimistic number isn't a budget. |
| D35 | **Revenue is shown as ceilings**, with the $29 agency wholesale case alongside $49 retail. | Avoids overstating MRR. |
| D36 | **Upgrades follow measured triggers** (COSTS.md §8), not customer counts. | Capacity depends on lead volume and behavior, not account numbers. |
| D37 | **First alerts (step 0) are dispatched right at intake**, after the lead commits. The minute cron handles reminders, escalation calls, retries and recovery. *Refines SPEC §3/§9.* | A once-a-minute poll alone can't meet the p95 < 30 s first-alert target. |
| D38 | **SMS capacity is per campaign**: adding phone numbers doesn't add throughput. Capacity responses are re-vetting, approved throughput increases, or a separately provisioned sender. | Prevents a wrong scaling reflex. |
| D39 | **Second SMS provider: formal review at 300 locations**; build failover when a reliability or capacity trigger fires. It must have its own registered sender, tested routing and shared opt-outs. Design a provider-neutral interface in v1. | Locations are a poor proxy for message volume; a fake "backup" sharing the same dependencies adds nothing. |
| D40 | **Push notifications are additive only** until a trial shows push + SMS doesn't slow acknowledgment. Trial starts when > 50% of active contacts use the installed app. | The metric is human acknowledgment, not push delivery. |
| D41 | **Widget retries reuse one submission id; the form shows "Not sent" until the server confirms.** Browser storage is a convenience, not durability. A fallback intake endpoint on Supabase Edge Functions comes at Stage B, with the same auth, spam and idempotency rules. | Honest status for homeowners; no easier path for forged leads. |
| D42 | **Get insurance and CPA advice before the first paying customer**: cyber/E&O quote; Texas SaaS sales tax (80% taxable) and agency resale treatment. | Lost-business claims and tax exposure start with the first invoice. |

## Rename (2026-10-23)

| # | Decision | Why |
| --- | --- | --- |
| D43 | **The product is now named My Office Bot.** *Supersedes the name in D19.* Placeholder domains are `myofficebot.app`. The GitHub repo was renamed to `thunder-chciken/my-office-bot` (the old URL redirects). Trademark and domain clearance for the new name are still required. | Matt's decision. |

## Free beta (2026-10-23)

| # | Decision | Why |
| --- | --- | --- |
| D44 | **The beta runs on free tiers**: Vercel Hobby, Supabase Free, Resend Free, the Twilio trial (up to 5 verified phones), Cloudflare Email Routing. **Switch to Vercel Pro ($20/mo) before the first outside contractor uses it**, because Hobby is non-commercial only. Upgrade Twilio when the beta outgrows 5 phones or needs texts without the trial line (sole-proprietor 10DLC is an option before the LLC exists). Add a nightly free database export, since Supabase Free has no backups. Escalation scheduling uses pg_cron, not Vercel Cron (Hobby cron runs only once a day). | Matt's choice: spend $0 while testing, pay only when real users join. |

## Beta v0.1 build (2026-10-23)

| # | Decision | Why |
| --- | --- | --- |
| D45 | **First real capture path is a public form endpoint** `POST /api/v1/forms/{site public_key}`: plain HTML form posts, JSON and plugin webhooks. Protected by honeypot, link and hourly-volume risk scoring (quarantine, never discard), and 5-minute transport dedupe. The HMAC-signed WordPress plugin (SPEC §10.1) follows. | Gets real leads flowing from any site today; the public key is designed to sit in page HTML. |
| D46 | **Beta alerts are email-only, dispatched inline at intake**, recorded in `notification_attempts` with Resend idempotency keys. No homeowner confirmation email yet (it would let anyone send mail to an arbitrary address until Turnstile is in). | Free-tier beta; texts and calls follow once Twilio is upgraded. |
