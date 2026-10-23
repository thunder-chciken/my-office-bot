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
