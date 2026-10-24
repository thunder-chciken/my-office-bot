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
| D47 | **The schema grants table access to `service_role` explicitly** (`0002_service_role_grants.sql`). | New Supabase projects no longer auto-grant new public tables to the API roles; the first live lead failed with "permission denied" until this ran. |

## Scheduling calendar (2026-10-23, R&D 010)

| # | Decision | Why |
| --- | --- | --- |
| D48 | **Scheduling MVP** = lead-to-appointment, crew assignment with database-checked conflicts, basic multi-day project blocks, Today/Week/List/Unscheduled views, staff email reminders, manual reschedule with a notify preview. **V2** = homeowner booking link, read-only .ics feed, one-tap "next workday", drag-and-drop. **Later** = two-way Google sync, weather suggestions, dispatch. Plan in `docs/SCHEDULING.md`. | Contractors need both where they're going and where crews are committed; sync and self-booking add complexity before demand is proven. Keep it an extension of the lead inbox. |

## Accounts and sign-in (2026-10-23)

| # | Decision | Why |
| --- | --- | --- |
| D49 | **Sign-in is Supabase Auth: Google, or email + password (8+ characters, email confirmation required).** First sign-in goes to `/onboarding`, which calls `create_my_account()` (0004) to create the account, owner membership, owner alert contact and form key in one step. The signed-in app lives at `/app`; the public demo stays at `/`. Confirm and reset emails use token-hash links to `/auth/confirm`, so they work on a different device; Google returns via `/auth/callback`. Auth emails send through Resend SMTP from no-reply@myofficebot.app. | Matt wants people to sign up with Google or email and password. Supabase's built-in email only reaches team members, so custom SMTP is required for real sign-ups. |
| D50 | **Plain-language beta Privacy (`/privacy`) and Terms (`/terms`) pages**, linked from sign-up and Google's consent screen (required to publish Google sign-in). Terms say alerts are a backup, not a guarantee, and cap liability at fees paid ($0 in the free beta). **A lawyer reviews both before outside contractors join** (R&D 009). Contact is support@myofficebot.app (Cloudflare Email Routing → Gmail). | Google requires these links. Keeps Matt's personal email out of the public repo. |

## Desktop dashboard (2026-10-23)

| # | Decision | Why |
| --- | --- | --- |
| D51 | **One app, two layouts.** Signed-in `/app` (and the sample-data `/demo`) switch to a dashboard on screens 1024px and wider: sidebar (Leads, Schedule, Team & alerts, Website & forms, Business profile), two-pane Leads, sheets shown as centered dialogs. Upright tablets get the phone layout full-screen; the public demo at `/` keeps the phone frame. **Saves go through database functions** (0005): `update_my_business`, `save_contact`, `remove_contact` (owner/admin only; at least one person must keep getting alerts) and `set_lead_status` (anyone on the account). Business profile adds phone, city and trades to `accounts`. In real accounts only email alerts can be switched on; texts and calls show "Soon". Schedule saving is still to come. | Matt wants clients to set up their profile on a PC or tablet. Routing every write through checked functions keeps people inside their own account without opening table-level write access. |

## Platform admin (2026-10-23)

| # | Decision | Why |
| --- | --- | --- |
| D52 | **`/admin` for Matt only.** Admins are listed in `private.platform_admins` (granted in the SQL editor, never in code); everyone else gets a 404. Shows all businesses and people, lead counts, failed alert emails and an admin log. Actions: **pause/resume** a business (its forms answer "paused" and its app shows a paused screen), **delete a business** (cascades to its leads, team, form and schedule), **delete a person** (their sign-in, plus businesses only they use if ticked). Deletes need the exact name/email typed, re-checked on the server, and every action is written to `admin_audit`. Admins can't delete themselves. Uses the server-only secret key after the admin check. | Matt needs back-office control (removing users, stopping abuse) without opening the Supabase dashboard. |

## Customers (2026-10-23)

| # | Decision | Why |
| --- | --- | --- |
| D53 | **Every real lead becomes a customer**, matched within the business by phone (last 10 digits) or email, so repeat customers don't duplicate (0007). Contractors can add, edit, note and delete customers (deleting keeps their leads). New tab **Customers** (phone tab bar: Leads, Schedule, Customers, Alerts, Business; Website moved inside Business). **Save to phone contacts** on every lead and customer downloads a vCard from `/api/v1/vcard?lead=` or `?customer=` (ids only in the URL; read under Row Level Security). Spam and quarantined leads don't create customers. | Matt wants contractors to keep a customer list and get homeowners into their phone contacts so calls show by name. |

## Schedule saving and crew emails (2026-10-24)

| # | Decision | Why |
| --- | --- | --- |
| D54 | **The schedule saves through `save_booking` / `set_event_status` and loads through `my_schedule`** (0008). The app keeps "day + minutes"; the database turns that into real timestamps in the business's time zone and back, and creates the job in the same call when booking from a lead. The 0003 double-booking rule still runs at commit; who's-going is only rewritten when it changes, so a rain move isn't blocked by clashes already accepted. **Evening-before crew email:** Vercel Cron hits `/api/cron/daily-digest` daily at 23:00 UTC (≈5–6pm Central; Hobby crons may run any time in that hour), protected by `CRON_SECRET`. Everyone booked tomorrow (people assigned directly or through a crew, with an email) gets one email of their stops; `schedule_notifications` + Resend idempotency keys mean a re-run never double-sends. Paused businesses are skipped. Admin has "Send tomorrow's crew emails now". | Matt wants bookings to stick and crews to know tomorrow's plan without opening the app. |

## Save to phone contacts, fixed (2026-10-24)

| # | Decision | Why |
| --- | --- | --- |
| D55 | **Contact cards use signed links**, not the sign-in cookie: the app asks the server (which checks the person can see the lead/customer) for `/api/v1/vcard?t=kind.id.expiry.signature`, valid 30 days, signed with a key derived from the Supabase secret. The card is served `inline` and opened in place, so iPhone shows "Create New Contact" and Android offers Contacts. **Every lead alert email now has a "Save contact" button and the .vcf attached.** Install icons in the manifest gained `?v=2` so installed Android apps refresh to the mascot; iPhones need the app removed and re-added. | Matt found Save contact didn't work from the installed app: phones open cards in a separate browser window without the app's sign-in. Attaching the card to the alert email lets him save a homeowner straight from the inbox. |

## Text message alerts (2026-10-24)

| # | Decision | Why |
| --- | --- | --- |
| D56 | **Texts follow SPEC §8 consent.** The owner turns texts on for their own number by ticking the consent box (wording + phone stored as evidence); anyone else gets "Reply YES to agree or STOP to opt out" and alerts start on YES (inbound SID stored). STOP/START at `/api/twilio/sms/inbound` flip `phone_opted_out` for that number everywhere; Twilio answers STOP/START/HELP itself. A changed phone number needs fresh consent. **Each business has a texting switch (`accounts.sms_status`)** that only the platform admin turns on, after the carrier registration is approved; turning it on sends any waiting YES invites. New-lead texts go out at intake (before the email) with Twilio delivery reports at `/api/twilio/status`; both webhooks check `X-Twilio-Signature` against the public URL. Calls and quiet hours come later. | US carriers block texts from unregistered local numbers, and Twilio trials can't register, so texting must be switchable per business once approved. Consent records protect Matt and his customers. |

## Website connection: WordPress plugin (2026-10-24, R&D 012)

| # | Decision | Why |
| --- | --- | --- |
| D57 | **A WordPress plugin captures the contractor's existing forms, unchanged** (no form builder of our own). Hooks each builder's accepted-submission point: Bricks `bricks/form/response` (every form, no setup) with `bricks/form/custom_action` as backup; Divi `et_pb_contact_form_submit` (+ Divi Form Builder `df_after_process`); CF7 `wpcf7_submit` (mail sent or failed, not spam); WPForms `wpforms_process_complete`; Gravity `gform_after_submission`; Elementor Pro `elementor_pro/forms/new_record`. Only name/phone/email/address/service/message are forwarded (auto-matched by label/name/type, per-form overrides; files, passwords, payment fields never). Delivery is server-to-server, **HMAC-signed with a per-site secret** (`sites.plugin_secret`, owner can rotate) + 5-minute timestamp window, stable event id per submission; queued in WordPress and sent after the visitor's page is answered, retried on a 5-minute schedule, admin visits and new submissions, given up after 3 days with a visible failure list. Distributed as a zip from the app (`scripts/build-plugin.py`); wordpress.org later. **No catch-all embed script in v1** (it could create false or duplicate leads); non-WordPress sites use the form address or ready-made form. **Divi 5 must be confirmed on a real site** before it's promised. | Matt's clients already have Bricks/Divi forms and he doesn't want a form builder. Server-side hooks only see submissions the form accepted. |
| D58 | **Creature comforts, first batch (docs/ENHANCEMENTS.md).** *Quick replies:* up to 10 per business in `accounts.quick_replies` (null = the 4 built-in ones), edited by owners/admins under Business, `{name}` fills in the customer's first name, saved through `save_quick_replies`. *Lead notes:* `lead_notes` table (read by RLS, written through `add_lead_note` / `delete_lead_note`, anyone on the account), shown on the lead and on its customer. *Live refresh:* the app re-reads leads every 30 s while on screen and when it comes back on screen (never two at once, at most every 5 s); new leads get the banner and a toast, and customers are re-read when one arrives. *Recently viewed customers:* last 5, on the device only. Pull-to-refresh was left out; the on-screen refresh covers it. | Pass 1 of the plan plus Matt's quick replies: fewer taps, nothing new to learn. |
| D59 | **The plugin has an optional chat bubble, and its "Powered by" link tracks referrals.** A "Get a quote" button in a bottom corner opens a fixed form: name, phone, "What do you need help with?" (no form builder; D57 still stands). The owner sets the brand color (text turns white or dark automatically for contrast), an icon (chat, phone, house, wrench) or their logo from the Media Library (square, 120x120 or larger, shown as a circle from WordPress's square thumbnail), the corner, and four pieces of wording, with a live preview. Off until switched on. Submissions post to the site's own REST route `myofficebot/v1/bubble` (honeypot, 2-second minimum, 5 per 10 min per IP, name and a 7-15 digit phone required) and then go through `MOB_Capture` like any form, so the secret never reaches the browser; leads show as "Chat bubble". A "Powered by My Office Bot · Get it for your business" line (on by default, can be switched off; `rel="nofollow sponsored"`) links to `myofficebot.app/?ref=<site key>`. The browser keeps the ref for 60 days; after onboarding, `set_my_referral` records it once on a new account (never its own site); /admin shows a Referred count per business. If the plugin is ever listed on WordPress.org, the link must default to off. | Matt wants a simple on-site lead capture for sites without a good form, plus free word-of-mouth from every customer's site. |
