# My Office Bot — Hosting, Costs & Growth Plan

A living financial model, agreed by Claude and ChatGPT in R&D 007–008 (2026-10-23).

- **Vendor prices were last checked 2026-10-23.** Sources: vendor pricing pages plus third-party summaries. Re-check each one at signup.
- Anything marked *estimate* is a planning assumption, not a quote.
- Replace the assumptions with real numbers after the first 10 contractors.

**Guiding question:** not "can this stack support 10,000 businesses?" but "can we confidently handle 10, measure every failure, and know exactly when to upgrade?"

---

## 1. Hosting decision

| Option | Price | Verdict |
| --- | --- | --- |
| **Vercel Pro** | $20/seat/mo + usage | **Chosen.** The app is already Next.js on Vercel. Per-minute cron (backup trigger). Best Next.js support. |
| Netlify Pro | $20/mo flat, unlimited members (since Apr 2026), credit-based | Good alternative; no reason to migrate. **Netlify Free is out:** sites pause when credits run out, and a paused site loses leads. |
| Vercel Hobby | Free | **Not allowed:** non-commercial use only, and cron runs once a day. |
| Cloudflare Workers | $5/mo + usage | Cheapest at scale, but Next.js needs the OpenNext adapter. Reconsider when measured hosting costs justify it. |

The host matters less than it seems, because Postgres does the scheduling. The host serves the app and receives webhooks.

**Protecting intake when the host is down:**

| Lead path | Protection |
| --- | --- |
| WordPress plugin | Queues and retries submissions itself |
| Forwarded email | Resend keeps received emails if our webhook is down (retry window to verify) |
| Native widget | See below |

**Native widget behavior:**
- A stable submission id is created before the first request and reused for every retry. Transient failures are retried; validation errors are not.
- The form shows **"Not sent"** until our server confirms it saved the lead, and never says "received" before that.
- After repeated failure it offers a retry button and the contractor's phone number.
- Browser storage is cleared after the server confirms, and photos are never kept there.
- The browser copy is a convenience, not guaranteed delivery.

**Stage B addition:** a fallback intake endpoint on Supabase Edge Functions, using the same authorization, spam checks and idempotency.

## 2. Vendor unit prices (checked 2026-10-23)

| Service | Item | Price |
| --- | --- | --- |
| Twilio | Outbound / inbound SMS | $0.0083 per segment each way, + carrier fee ~$0.0035–0.005 per segment |
| Twilio | Outbound local voice | $0.014 / min |
| Twilio | Answering-machine detection | $0.0075 per answered call |
| Twilio | Local number | $1.15 / mo |
| 10DLC (via Twilio) | Standard brand + vetting | ~$46 one-time |
| 10DLC (via Twilio) | Campaign vetting | $15 one-time |
| 10DLC (via Twilio) | Campaign fee | ~$1.50–10 / mo depending on use case |
| Telnyx (future 2nd provider) | SMS | ~$0.004 / segment + carrier fees |
| Telnyx (future 2nd provider) | Voice | ~$0.007 / min *(unverified)* |
| Resend | Free | 3,000 emails/mo (100/day) |
| Resend | Pro | $20 / 50k emails, $35 / 100k |
| Resend | Scale | from $90 / 100k |
| Resend | Notes | Inbound email counts against the quota |
| Supabase | Pro | $25/mo incl. $10 compute credit, 100 GB file storage |
| Supabase | Team | $599/mo (SOC 2, SSO) |
| Vercel | Pro | $20/seat/mo |
| Stripe | Card | 2.9% + $0.30 |
| Stripe | Billing | ~0.7% |
| Stripe | Tax | ~0.5% |
| USPTO | Trademark | $350 per class |

## 3. Monthly fixed costs at launch (pilot)

| Service | / month |
| --- | --- |
| Vercel Pro | $20 |
| Supabase Pro | $25 |
| Twilio campaign fee + 2–3 numbers | $13–20 |
| Resend | $0 (free) → $20 |
| Better Stack (uptime) + Sentry (errors) | $0 (free tiers) |
| Google Workspace (support@, billing@) | $7–14 |
| Support phone line (Twilio number + voicemail to email) | ~$2 |
| Bookkeeping software *(estimate)* | $30–40 |
| Domain (annualized) | ~$2 |
| **Core total** | **~$100–125** |
| **Budget with buffer** | **$100–150 / month** |

Not included: founder time, insurance, CPA, sales and marketing.

## 4. One-time startup costs

| Item | Allowance |
| --- | --- |
| Texas LLC filing | ~$300 |
| 10DLC brand + campaign setup | ~$60–150 |
| Trademark filing (class 9 and/or 42; ask counsel) | $350 per class |
| Lawyer: terms, privacy, consent wording *(estimate)* | $1,500–3,000 |
| Domain + small setup | $25–100 |
| **Total** | **~$2,235–4,400** |

Also plan for:
- **Cyber/E&O insurance** (get a quote before the first paying customer; a contractor could claim lost business from a missed alert), *estimate* $1–2k/yr.
- **CPA** for annual filing, *estimate* $500–1,500/yr.

## 5. Messaging cost per lead (three scenarios)

| Scenario | Per lead | Assumes |
| --- | --- | --- |
| **Lean** | **$0.07** | ~4 outbound SMS segments, 1 inbound acknowledgment, 25% of leads reach a 1-min call, 3 emails |
| **Expected** | **$0.12** | More multi-segment texts, some retries, longer calls, some backups |
| **Stress** | **$0.28** | Heavy escalation, more contacts, retries |

Per location at 40 leads/month: lean **$2.80**, expected **$4.80**, stress **$11.20**. A busy location (150 leads) on the expected scenario: $18. Fair-use limits protect against outliers.

**Measure from day one:** outbound segments per lead, SMS failure rate, % of leads escalated to a call, call length, % needing backups, and messaging cost per location.

## 6. Unit economics per location (expected scenario, 40 leads/mo)

| | Retail $49 | Agency $29 |
| --- | --- | --- |
| Revenue | $49.00 | $29.00 |
| Messaging | −$4.80 | −$4.80 |
| Stripe (card + billing) | −$2.06 | −$1.34 |
| **Contribution before fixed costs** | **$42.14 (86%)** | **$22.86 (79%)** |

Sales tax:
- Texas taxes SaaS as a data processing service (80% of the price is taxable).
- Agency resale, out-of-state customers and Stripe Tax setup all need CPA advice **before the first Texas invoice**.

## 7. Growth stages

Revenue figures are **ceilings**: retail $49 before churn, trials and discounts. If half the locations come through agencies at $29, revenue is about 20% lower. Stages describe what changes. Upgrades happen when a **trigger in §8 fires**, not at a customer count.

### Stage A — Pilot (3–10 locations · up to $490 MRR)
- **Stack:** §3 as-is. Twilio only, with email as the fallback channel.
- **Monthly:** ~$100–150 fixed + under $50 messaging.
- **Goal:** prove capture reliability, the 5-minute acknowledgment metric, and real cost per location.

### Stage B — Early traction (~100 locations · up to $4,900 MRR)
- **Add:** Resend Pro, Supabase compute bump + point-in-time recovery + quarterly restore tests, paid uptime monitoring, helpdesk, the fallback intake endpoint, insurance, part-time support.

| Cost item | / month |
| --- | --- |
| Infrastructure + tools | ~$450–600 |
| Messaging | ~$480 (stress $1,120) |
| Stripe | ~$206 |

- **Margin before labor:** roughly 75%+.

### Stage C — Established (~1,000 locations · up to $49,000 MRR; ~$39,000 if half are agency)
- **Volume:** ~40k leads/mo → ~200k SMS/mo. **Storm days are the real peak:** a hail storm hits every roofer in a region at once, so plan for 3–5× the average daily volume.
- **Add:** better SMS sender vetting and capacity planning with Twilio, a second texting provider once a §8 trigger fires (the formal review happens at 300 locations), dedicated dispatcher capacity if the trigger fires, larger database compute, Resend Scale, and a support/on-call team.

| Cost item | / month |
| --- | --- |
| Messaging | ~$4,800 (stress $11,200) |
| Stripe | ~$1,700–2,100 |
| Infrastructure + tools | ~$1,000–1,500 |
| Staff | separate |

### Stage D — Large platform (10,000+ locations · up to $490,000 MRR; $290,000 if all agency)
- **Volume:** ~2M SMS/mo with large regional storm peaks. **Carrier capacity is the constraint, not price.**
- **Add:**
  - Enterprise carrier agreements, a short code or high-throughput toll-free sender, and negotiated rates.
  - Independently deployed dispatcher workers.
  - Supabase Team, or managed Postgres on AWS with read replicas and partitioned event tables.
  - Real disaster recovery.
  - A SOC 2 Type II audit (~$20–50k/yr plus compliance tooling) for franchise and enterprise deals.
  - Possibly a native app (Expo) and cheaper hosting (Cloudflare/AWS).
- **Messaging at list price:** ~$48k/mo expected. Negotiated rates and a second provider can cut that substantially.

### Built in now so growth doesn't need a rewrite
- A provider-neutral messaging interface (adding Telnyx is a config change, not a rewrite).
- Push notifications exist as a channel in the data model.
- Event tables can be split by month.
- The dispatcher can run outside serverless.
- An ops page showing queue depth, oldest unsent alert, and provider throughput use.

## 8. Upgrade triggers

| System | Trigger | Response |
| --- | --- | --- |
| Dispatcher | Processing lag p95 > 15 s (from tick to dispatch) for 3 days | Optimize, or move to a dedicated worker |
| Cron tick | Duration > 20 s | Investigate; scale if recurring |
| First alerts | p95 time-to-first-alert > 30 s | Treat as a defect (first alerts are sent right at intake, not on the cron) |
| Escalations | Any eligible step > 2 min overdue | Page us |
| SMS queue | p95 delay > 10 s | Investigate campaign throughput, rate limits, carrier throttling. **Adding numbers doesn't add capacity:** throughput is per campaign. Request more throughput or a separately provisioned sender. |
| SMS daily volume | > 50% of our **approved** daily allowance | Capacity review |
| SMS daily volume | > 75% of approved allowance | Escalate capacity planning (re-vetting, toll-free, short code) |
| Database | CPU > 60% or connections > 70%, sustained | Review queries/pooling, then compute size |
| Recovery | 100 locations | Point-in-time recovery on + quarterly restore drills |
| Email | > 80% of plan quota | Upgrade before running out |
| 2nd SMS provider | 300 locations | Formal readiness review |
| 2nd SMS provider | 2 provider incidents in a quarter delaying alerts > 5 min, **or** peak volume at 70% of approved capacity, **or** sustained delivery degradation, **or** a contract requires it | Implement failover with an independently registered sender, tested routing, and shared opt-outs |
| Push notifications | > 50% of active contacts use the installed app | Run an additive push + SMS trial on time-to-acknowledge. Never reduce SMS without that evidence. |
| Enterprise | A contract requires compliance controls | Supabase Team, SOC 2, related controls |

These are starting thresholds; adjust them with production data.

## 9. Abuse and cost controls

- **SMS pumping is largely designed out:** we only text verified contacts, never a number typed into a public form (homeowners get email in v1).
- New-account velocity limits.
- Per-account daily SMS and voice caps.
- Backup contacts must reply YES before any send.
- Photo uploads: max 5 photos × 5 MB, resized in the browser, kept 12 months.
