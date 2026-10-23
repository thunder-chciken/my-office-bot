# My Office Bot — Build Spec v1.1

Agreed by Claude and ChatGPT across R&D rounds 001–005 (2026-10-23). v1.1 folds in ChatGPT's review 005 (fixes M1–M8 and S1–S6, tagged inline as **[M#]** / **[S#]**). Settled choices are in [DECISIONS.md](DECISIONS.md). This spec is the implementation contract. Change it deliberately, not by drift.

**The promise:** every legitimate website lead reaches a responsible person, and we can prove what happened.

**North-star metric:** % of eligible leads acknowledged within 5 minutes (defined in §16). Secondary: time to first notification (target p95 < 30 s).

**The hardest part isn't receiving a lead or scheduling a call. It's acknowledging the correct lead, contacting the correct person, and stopping when we should.** The tests in §18 exist to prove that.

---

## 1. What exists today

| Piece | Status |
| --- | --- |
| Mobile UI (Leads, lead sheet, Alerts, Website, Business) | Clickable, mock data in React state |
| `POST /api/leads/[accountId]` | Accepts JSON/form posts, maps common field names, flags urgency words, returns 202. **Saves and sends nothing; no auth.** Replaced by `/api/v1/intake` in Milestone 1. |
| Database, auth, SMS, email, voice, scheduler | Not built |

## 2. Scope

**In v1:** WordPress plugin capture, email-forward capture, native widget / hosted form, spam scoring with quarantine, contractor SMS + email alerts, rescue links, acknowledgment, 5-minute voice escalation, backup contacts, quiet hours, append-only audit timeline, weekly report, one $49 plan with Stripe trial, agency account switcher.

**Not in v1:** live chat, AI receptionist, homeowner SMS (homeowners get on-screen + email confirmation), two-way SMS inbox, missed-call text-back, white-label, CRM integrations, scheduling, generic form-listener script, any direct-from-database send path **[S1]**.

## 3. Architecture

```
WordPress plugin ─┐
Email forward ────┼─► Next.js route handlers on Vercel ─► Supabase Postgres (source of truth)
Widget/hosted form┘        │                                   │
                           │                     pg_cron (every minute) ──► /api/cron/dispatch
                           │                     Vercel Cron (backup)  ──►        │
                           ▼                                                      ▼
                     Resend (email)  ◄──────── dispatcher ────────►  Twilio (SMS, voice)
                                                                         │ status + inbound webhooks
                                                                         ▼
                                                                  /api/twilio/*
```

- **One codebase**: Next.js app (UI + API) on **Vercel Pro**. Pro is required for per-minute cron.
- **Postgres is the scheduler.** No workflow engine in v1. Every pending alert is a row with `due_at`; a minute ticker claims and dispatches due rows. An outage means the next tick catches up.
- **First alerts go out right at intake (D37).** Once the lead commits, the intake handler immediately claims and dispatches its step-0 attempts using the same claim/eligibility/fencing path as the cron. If that fails, the rows stay `pending` and the next tick picks them up. The cron's job is reminders, escalation calls, retries and recovery. Without this, a once-a-minute poll can't meet the p95 < 30 s first-alert target.
- **One dispatch path only [S1].** pg_cron is the primary trigger and Vercel Cron the backup. Both run the same dispatcher with the same eligibility and ledger rules. Resilience beyond that comes from monitoring and alarms (§15), not a second send path.

## 4. Data model

Every tenant table carries `account_id`. Timestamps are `timestamptz`. Phones are E.164.

**Tenant consistency is enforced by the database [M7].** Every parent table has `unique (account_id, id)`, and every child row references its parent through a composite foreign key that includes `account_id`, so a row can never point at another tenant's lead, contact or site.

```sql
accounts (id, name, timezone,                 -- IANA name, e.g. America/Chicago (DST-safe) [M4]
          billing_status text check in ('trialing','active','past_due','suspended','canceled'),   -- [S6]
          sms_status   text check in ('not_configured','pending_verification','active','rejected','suspended'),
          voice_status text check in ('not_configured','active','suspended'),
          quiet_hours  jsonb,                 -- {start:"21:00", end:"07:00", urgent_calls:false}
          stripe_customer_id, created_at)

memberships (account_id, user_id, role text check in ('owner','admin','member','agency'),
             primary key (account_id, user_id))

contacts (id, account_id, user_id null, name, role_label, phone, email,
          alert_sms bool, alert_email bool, alert_call bool,
          is_backup bool, ladder_order int,
          consent_status text check in ('pending','confirmed','revoked'),
          consent_evidence jsonb,             -- wording shown, timestamp, IP or inbound message SID
          phone_opted_out bool default false, -- STOP received; blocks SMS AND voice [M4]
          removed_at null, created_at,
          unique (account_id, id))

sites (id, account_id, domain, capture_type text check in ('wp_plugin','email','widget','webhook'),
       forward_token text unique,             -- random part of the forwarding address [M6]
       email_sender_allowlist text[],         -- confirmed From addresses for forwarded form emails [M6]
       last_lead_at, created_at, unique (account_id, id))

site_keys (id, account_id, site_id, key_prefix, secret_hash, installation_id,   -- bound to one plugin install [S3]
           created_at, revoked_at)            -- two active keys allowed during rotation

leads (id, account_id, site_id, channel, external_event_id, provider_message_id,
       name, phone, email, service, message, address, extra jsonb,   -- extra = allowlisted fields only
       risk_score int,
       risk_status text check in ('ok','quarantined','needs_review','released','spam'),
       released_at null,
       urgency text check in ('normal','urgent'),
       state text check in ('received','notified','acknowledged','contacted','closed','spam'),
       received_at, acknowledged_at, acknowledged_by_contact_id,
       contacted_at, contact_evidence text check in ('self_reported','system_verified'),
       ladder_started_at, ladder_ended_at null, ladder_end_reason text,   -- terminal ladder state [M2]
       related_lead_id null, duplicate_policy text,                       -- [S4]
       created_at,
       unique (site_id, external_event_id),
       unique (account_id, id))

lead_events (id, account_id, lead_id, type, actor, data jsonb, created_at)    -- append-only
            foreign key (account_id, lead_id) references leads (account_id, id)

notification_attempts (id, account_id, lead_id, contact_id,
       channel text check in ('sms','email','voice'), step int, due_at,
       status text check in ('pending','claimed','dispatching','sent','delivered','failed',
                             'canceled','uncertain','skipped'),
       claimed_at, lease_expires_at, worker_id,
       fence int default 0,                   -- increments on every claim [M3]
       attempt_count int default 0,
       idempotency_key text unique,           -- lead_id:step:contact_id:channel
       to_address text,                       -- exact destination used [M8]
       provider_sid text unique null,         -- Twilio Message/Call SID or Resend id [M8]
       provider_status, provider_status_rank int, error, created_at, updated_at,
       foreign key (account_id, lead_id)    references leads (account_id, id),
       foreign key (account_id, contact_id) references contacts (account_id, id))

alert_codes (account_id, contact_id, lead_id, code char(4), expires_at,   -- SMS ack codes [M1]
             primary key (contact_id, code))

rescue_tokens (token_hash primary key, account_id, lead_id, contact_id, expires_at, revoked_at,
               foreign key (account_id, lead_id) references leads (account_id, id))

provider_callbacks (provider_sid, status, received_at, primary key (provider_sid, status))   -- callback dedupe [M8]

scheduler_heartbeat (id, ran_at, claimed int, dispatched int, source text)

source_counts (site_id, form_id, day, submissions int)   -- plugin-reported totals for reconciliation [S5]
```

**Event types:** `received`, `quarantined`, `needs_review`, `released`, `marked_spam`, `alert_queued`, `alert_sent`, `alert_delivered`, `alert_failed`, `alert_skipped`, `call_answered`, `voicemail`, `acknowledged`, `assigned`, `contacted`, `escalated_backup`, `ladder_ended`, `closed`, `duplicate_linked`, `billing_notice`.

## 5. Lead states

| State | Meaning | Set by |
| --- | --- | --- |
| Received | A valid request entered the system | Intake |
| Notified | At least one alert was sent; delivery is tracked per attempt | Dispatcher |
| Acknowledged | A specific person accepted responsibility | Authenticated human action only (§7) |
| Contacted | Someone reached out to the customer | v1: self-reported. "System-verified" only with evidence (v2: tracked business number) |

Rules:
- Marking "contacted" does not silently stop escalation. The app's "I called them" button records `acknowledged` **and** `contacted` as two explicit events.
- Closing a lead, marking it spam, or quarantining it ends its ladder (`ladder_ended_at`, reason) and cancels its pending attempts **[M2]**.

## 6. Escalation ladder

Default policy (editable per account). Times count from the **clock start**: `received_at`, or `released_at` for a released lead, or the end of quiet hours for a non-urgent lead received during quiet hours.

| Step | When | Action |
| --- | --- | --- |
| 0 | 0:00 | SMS + email to every non-backup contact with those channels on; homeowner gets email confirmation |
| 1 | 2:00 | Reminder SMS to ladder #1 |
| 2 | 5:00 | Voice call to ladder #1 ("press 1 to take this lead") |
| 3 | 7:00 | SMS + voice to backup contacts |
| end | 30:00 | Ladder ends: `ladder_ended_at`, `ladder_end_reason = 'exhausted'`, all pending attempts canceled, lead flagged in the app and report |

The ladder also ends on acknowledgment, close, spam, quarantine, or account suspension (§17).

**Quiet hours** are evaluated at dispatch time in the account's IANA timezone, so DST is handled. Step 0 SMS and email still send. Voice steps are skipped unless the lead is `urgent` **and** the account opted into night calls.

**Channel gating:** if `sms_status` ≠ `active`, SMS attempts are `skipped` and the app shows "Text alerts pending carrier approval — email alerts are on." The 5-minute call promise is never shown as active when voice is unavailable.

### Eligibility predicate [M2][M4]

One SQL function, `attempt_is_eligible(attempt_id)`, is evaluated **at claim and again inside the dispatch transaction**, with the lead row locked `for update` and the contact row locked `for share`. An ineligible attempt becomes `skipped` (with an `alert_skipped` event and reason) or `canceled`.

An attempt is eligible only if **all** of these hold:

- **Lead:** `risk_status in ('ok','released')`; `state not in ('closed','spam')`; `ladder_ended_at is null`; and `acknowledged_at is null` for steps ≥ 1.
- **Contact:**
  - `removed_at is null`, and the toggle for this channel is on.
  - For SMS and voice: `phone_opted_out = false`.
  - Backups only: `consent_status = 'confirmed'`.
  - Users: signup consent is recorded.
- **Account:** `billing_status` permits alerts (§17); the channel's activation status is `active`; quiet-hours rules are evaluated *now*.
- **Destination:** the attempt's `to_address` still equals the contact's current phone or email. If it changed, re-plan the attempt; never send to the old address.

## 7. Acknowledgment (only these count)

1. **Press 1** on an escalation call. The `<Gather>` callback must match a call SID belonging to a `dispatching`/`sent` voice attempt for that lead and contact, and the lead must still be unacknowledged **[M8]**.
2. **SMS reply with the lead's code [M1]:**
   - Every alert SMS ends with "Reply 4821 to take this lead." The code is 4 digits, unique among that contact's open leads, and stored in `alert_codes`.
   - An inbound SMS is accepted only when it arrives at our alert number, `From` matches a contact phone, and the code maps to an open lead for **that** contact.
   - A bare `1` is accepted only when the contact has **exactly one** eligible unacknowledged lead.
   - Otherwise we reply: "You have 3 new leads — reply with the 4-digit code from the alert, or tap its link." We never guess.
   - The confirmation names the lead: "Got it — Dana W., roof leak. You're on it."
3. **Rescue page** "I'm handling this" (a POST, §8).
4. **In-app** button.

A delivered SMS, an answered call, a voicemail, an email open, or a visit to a link **never** count. Ambiguous answering-machine results are treated as not acknowledged. Acknowledgment is atomic and idempotent: a second acknowledgment of the same lead is a no-op that reports who already took it.

## 8. Rescue link [M5]

- Every alert includes `https://<domain>/r/<token>`. The token is 32 random bytes and only its SHA-256 hash is stored. It is valid 72 h and scoped to one lead and one contact.
- **GET /r/<token>:**
  - Has no side effects, so link scanners can't acknowledge anything.
  - Exchanges the token for an HttpOnly, SameSite=Strict, path-scoped cookie (`/r/l/<lead_id>`, 72 h max) and 302-redirects there. The token never sits in the address bar, history or `Referer`.
- **The lead page shows only:** customer first name + last initial, service, message, city, received time, and who has already taken it (if anyone).
  - The phone number is revealed by the **Call customer** POST, which logs a `contacted`-intent event.
  - The full address and email require login.
- **Actions are POSTs** with a CSRF token:
  - **I'm handling this** → acknowledge.
  - **Call customer** → reveal the number and dial.
  - **Assign** → only to active contacts of the same account. It records `assigned` plus `acknowledged` by the assignee only after the assignee confirms through their own alert.
- **Tokens and cookies are invalidated** when the contact is removed, the contact's consent is revoked, the lead is closed or marked spam, or the lead is assigned away from the holder (for the assign action).
- The rescue page sets `Referrer-Policy: no-referrer`, loads no third-party scripts or analytics, and paths under `/r/` are redacted in logs.

## 9. Dispatcher

### Attempt state machine

```
pending ─claim─► claimed ─authorize─► dispatching ─► sent ─► delivered / failed
   │                │                      │
   │                └─ lease expired ─► pending (fence++)    └─ worker died / timeout ─► uncertain
   └─ ineligible ─► skipped / canceled
```

### Recovery by last durable state [M3]

| Last durable state | Recovery |
| --- | --- |
| `claimed` (provider not yet called) | Lease expiry → back to `pending`, `fence` increments. After 3 expiries → `failed` + ops alert. |
| `dispatching` (provider may have been called) | Never returns to `pending`. Lease expiry → `uncertain`. |
| `uncertain`, voice | Look the call up by SID or our attempt id in Twilio. Settle to `sent`/`failed`. Never auto-redial. |
| `uncertain`, SMS/email | Look up the provider; if there's still no evidence after 2 min, retry once (at-least-once policy). |
| `sent` | Only provider callbacks move it forward. Never redispatched. |

**Fencing:** the transition `claimed → dispatching` requires `worker_id = me`, `fence = my_fence`, and `lease_expires_at > now()` in the same `UPDATE ... WHERE`. A stale worker whose lease expired affects 0 rows and must stop. It never calls the provider.

We guarantee one durable claim owner per attempt and suppression of known duplicates, not exactly-once delivery across every network failure.

### Claim (one transaction)

```sql
with due as (
  select a.id
  from notification_attempts a
  where a.status = 'pending' and a.due_at <= now()
  order by a.due_at
  for update skip locked
  limit 50
)
update notification_attempts n
set status = 'claimed', claimed_at = now(),
    lease_expires_at = now() + interval '60 seconds',
    worker_id = $1, fence = n.fence + 1, attempt_count = n.attempt_count + 1
from due where n.id = due.id
returning n.*;
```

### Dispatch (per attempt)

1. Begin. Lock the lead `for update` and the contact `for share`. Evaluate `attempt_is_eligible`; if false → `skipped`/`canceled`, commit, stop.
2. Fenced update `claimed → dispatching`; set `to_address`. Commit.
3. Call the provider. The status-callback URL carries the attempt id, and we store the returned `provider_sid` immediately.
4. Success → `sent` + `alert_sent`. Timeout → `uncertain`.

**Acknowledge** takes the same lead lock, sets `acknowledged_at`, ends the ladder for future steps, cancels `pending`/`claimed` attempts, and then asks Twilio to cancel any of the lead's calls still `queued`/`ringing` (`in-progress` calls are ended with `status=completed`).

**Known, accepted limitation:** an acknowledgment committed after step 2 can't stop one ring. The voice answer handler re-reads the lead, and if it's already acknowledged it says "Jenna already took this lead. Goodbye." and hangs up.

### Provider callbacks [M8]

- Validate `X-Twilio-Signature` against the **public** URL (`PUBLIC_BASE_URL` + path, never the proxied `req.url`) and the exact form-encoded parameters.
- Look up the attempt **by `provider_sid`**, then confirm that the account, channel and destination (`To`) match it. The attempt id in the URL is a cross-check, not authority.
- Deduplicate on `(provider_sid, status)`.
- Transitions only move forward by rank (`queued < sent < delivered/failed`; for calls `ringing < in-progress < completed/no-answer/busy/failed`). Terminal or `canceled` attempts never reopen, and late callbacks can't restart a ladder or change ownership.

### Delivery policy by channel

| Channel | Guarantee | On ambiguous outcome |
| --- | --- | --- |
| SMS / email alerts | At-least-once | Retry once (see recovery table). A duplicate alert is cheap; a missed one is the failure we exist to prevent. |
| Voice | At-most-once per step | `uncertain` → reconcile; never auto-redial. |

The reconciler runs inside `/api/cron/dispatch` and handles expired leases, `uncertain` rows older than 2 min, and `sent` rows with no final status after 10 min.

## 10. Capture

### 10.1 WordPress plugin (first)

- Hooks fire only after a successful submit: Gravity Forms `gform_after_submission`, WPForms `wpforms_process_complete`, Contact Form 7 `wpcf7_mail_sent`, Elementor Pro `elementor_pro/forms/new_record`, Bricks form custom action.
- **Installation binding [S3]:**
  - Activating the plugin creates an `installation_id` and exchanges a one-time setup code (copied from our app) for a site key + secret.
  - The key is bound to that site and installation.
  - `page_url` and browser `Origin` are risk signals only, never authentication.
- Field mapping UI per form (auto-guessed, editable). Only mapped fields are sent.
- Sends `POST /api/v1/intake` with a plugin-generated `event_id` (UUID). Retries through Action Scheduler with backoff if we're unreachable.
- Signed request:
  - `X-IO-Key: <key_prefix>`
  - `X-IO-Timestamp: <unix seconds>`
  - `X-IO-Signature: hex(HMAC-SHA256(secret, timestamp + "." + raw_body))`
  - Reject if the timestamp skew is > 300 s or the key is revoked.
- Body:
  ```json
  { "event_id": "uuid", "form_provider": "gravityforms", "form_id": "3",
    "submitted_at": "ISO-8601", "page_url": "https://...",
    "fields": { "name": "", "phone": "", "email": "", "service": "", "message": "", "address": "" } }
  ```
- Response: `202 {lead_id, duplicate: bool}`. The same `event_id` always returns the same `lead_id`.
- **Daily source count [S5]:** the plugin reports submissions per form per day from the form plugin's own entry store, so we can reconcile against stored leads.

### 10.2 Email forwarding [M6]

- **Address:** `leads-<forward_token>@in.<domain>`, where the token is random and rotatable. The address is never derived from the account id.
- **Transport:** the inbound provider's webhook signature is verified. Idempotency uses the **provider's delivery id**; `Message-ID` is kept as supplemental evidence.
- **Sender trust:**
  - A sender on the site's `email_sender_allowlist` with passing SPF/DKIM (or DMARC alignment) is trusted.
  - The first forwarded lead from a new sender goes to `needs_review` and asks the owner "Is this your website's form email?" A yes adds the sender to the allowlist.
  - Messages from unknown or failing senders are stored as `needs_review` and never start a ladder.
- **Loop and abuse guards:**
  - Drop auto-replies (`Auto-Submitted`, `X-Loop`, our own domains).
  - Rate-limit per forwarding address.
  - Forwarded email can never trigger an urgent call unless the sender is trusted and the lead passes normal risk checks.
- **Parsing:** known form-email layouts first, then a generic label parser. If no phone or email can be extracted → `needs_review` (stored for the owner, no ladder).

### 10.3 Widget / hosted form

- Public site key, Turnstile verified **server-side** (siteverify), honeypot field. The origin allowlist is a risk signal **[S3]**.
- Async buttons only: Request an estimate (form + photos), Text us (opens SMS on mobile, captures a number on desktop), Call us (tracked `tel:`). No live chat.

### 10.4 Integration health

The Website screen shows each site's last lead time and the source-count reconciliation status. If a site that usually gets leads has gone quiet for more than 3× its typical gap, the owner gets a warning.

## 11. Spam and duplicates

- **Risk score** after normalization, from channel-specific signals: server-verified Turnstile, honeypot, link count, spam phrases, disposable email domains, invalid phone, submission rate per IP and per site, page URL vs site, and email sender trust.
- High score → `quarantined`: stored, no ladder, in the daily digest, with one-tap **Not spam** (sets `released_at`, starts step 0).
- `needs_review` (unparsed or untrusted email) behaves the same way.
- Nothing is silently discarded.
- **Transport duplicates** (same `event_id` / provider delivery id) are idempotent and return the existing lead.
- **Semantic duplicates [S4]** (same phone or email within 10 min **and** near-identical message **and** urgency not higher) always become a stored lead with `related_lead_id` and a full audit record. Then:

| Original lead is… | Second lead gets |
| --- | --- |
| Acknowledged, ladder ended | One "same customer followed up" SMS to the acknowledging contact; no new ladder |
| Unacknowledged, ladder active | No new ladder; the original's next alert notes "customer followed up" |
| Anything else (closed, spam, or a different/more urgent message) | Its own full ladder |

  We never suppress an urgent or materially different follow-up.
- Urgency words are configurable per trade (leak, flooding, burst, no heat, no AC, sparking, gas smell). They're signals and are never labeled "verified emergency".

## 12. Security and tenancy [M7]

- **Auth:** Supabase Auth (SMS code or email magic link). Roles: owner, admin, member, agency.
- **RLS is enabled on every tenant table, with separate `SELECT` / `INSERT` / `UPDATE` / `DELETE` policies.** Base predicate: `account_id in (select account_id from memberships where user_id = auth.uid())`. Writes are further restricted by role:
  - Members can update leads (ack, contacted, close) but not account settings, ladder policy, keys or memberships.
  - Only owners/admins change contacts, ladder policy, quiet hours and sites.
  - Membership create/update/delete is only through an RPC that checks the caller is owner/admin of that account. Nobody can raise their own role; the last owner can't be removed.
- **Grants are a separate layer from RLS.** `anon` has no table privileges. `lead_events`, `notification_attempts`, `alert_codes`, `rescue_tokens` and `provider_callbacks` are not writable by `authenticated` at all; they change only through server code or `security definer` functions.
- **`security definer` functions** live in a non-exposed `private` schema with `set search_path = ''` and fully qualified names, and `execute` is granted only to the roles that need it.
- Composite foreign keys (§4) make cross-tenant references impossible even with hand-built ids.
- **Service-role code paths** (intake, Twilio, cron, rescue) first authenticate the caller (HMAC, provider signature, `CRON_SECRET`, rescue cookie), then resolve the account **from that credential**, then operate only on records within it. An id in a URL or body never authorizes anything.
- **Key rotation:** two active site keys per site; revocation takes effect immediately.
- **PII:** only allowlisted fields are stored. Leads are retained 24 months (configurable); quarantined spam is purged after 30 days; raw payloads are not persisted.
- **Audit:** membership, role, key, contact, consent and ladder-policy changes write audit events.

## 13. Compliance gates (Milestone 2 blockers)

1. **Legal entity + EIN** for My Office Bot (needed for 10DLC brand registration).
2. **Twilio A2P 10DLC:** brand + one "Account Notification" campaign with real sample messages and the opt-in flow below. **Confirm with Twilio** that platform-to-user lead alerts fit this classification. Toll-free verification runs in parallel as a fallback.
3. **SMS activation is a state:** `not_configured → pending_verification → active / rejected / suspended`. Email alerts work throughout.
4. **Consent wording** (counsel to review before launch):
   - User signup checkbox: *"Send me automated new-lead alerts by text and phone call at this number. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help."*
   - Backup contact invite SMS: *"My Office Bot: Matt at Bluebird Home Services added you as a backup for new-lead alerts by text and automated call. Reply YES to agree or STOP to opt out."* No alerts until they reply YES; store the inbound message SID as evidence.
5. **STOP/HELP [M4]:**
   - STOP sets `phone_opted_out = true`, which blocks both SMS **and** voice to that number for every account, and the app shows the contact as unreachable.
   - Email is unaffected.
   - START or re-consent in the app reverses it, with new evidence recorded.
   - HELP returns a support message.
6. **Homeowner emails** come from our authenticated domain (SPF/DKIM/DMARC) with the contractor's name as display name and their email as Reply-To. We never spoof the contractor's address.
7. **Quiet hours** default on (21:00–07:00, account timezone).

## 14. API routes

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/v1/intake` | Site HMAC (installation-bound) | Plugin / webhook capture |
| `POST /api/v1/plugin/activate` | One-time setup code | Exchange for site key + secret |
| `POST /api/v1/plugin/source-counts` | Site HMAC | Daily submission counts |
| `POST /api/v1/widget/submit` | Site key + server-verified Turnstile | Widget / hosted form |
| `POST /api/v1/inbound/email` | Provider signature + sender trust | Forwarded form emails |
| `POST /api/twilio/sms/inbound` | Twilio signature (public URL) | Ack codes, YES, STOP/HELP |
| `POST /api/twilio/status` | Twilio signature | Delivery and call status (by SID) |
| `POST /api/twilio/voice/answer` | Twilio signature | TwiML; late acknowledgment check |
| `POST /api/twilio/voice/gather` | Twilio signature + call-SID match | Press 1 → acknowledge |
| `GET /r/[token]` | Rescue token | Side-effect-free; set cookie, redirect |
| `GET/POST /r/l/[leadId]` | Rescue cookie + CSRF | Limited lead page and actions |
| `POST /api/cron/dispatch` | `CRON_SECRET` | Claim, dispatch, reconcile, heartbeat |
| `GET /api/health` | Public, minimal | Heartbeat age, oldest overdue attempt |
| App pages + server actions | Supabase session + RLS | Inbox, contacts, ladder, sites, reports |

## 15. Monitoring

- **Per-stage health:** intake rate, oldest unprocessed lead, scheduler heartbeat age, overdue attempts, `uncertain` count, SMS/voice failure rate, webhook signature failures, source-count mismatches.
- **Alarms** (Better Stack): heartbeat > 3 min old; any attempt > 2 min overdue; `uncertain` older than 5 min; SMS or voice failure rate > 5% over 15 min; intake 5xx; a source-count mismatch for any pilot site.
- **End-to-end synthetic test** every 15 min against an internal test tenant and test numbers (never real contractors). Both ladder branches are walked daily.
- **Internal ops page** with the metrics above plus per-account integration health.

## 16. Weekly report (every Monday morning)

**Metric definition [S2]**:

- **Eligible leads:** `risk_status` `ok` or `released`; not a linked semantic duplicate; not spam.
- **Clock start:** `received_at`, or `released_at` for released leads, or the end of quiet hours for non-urgent leads received during quiet hours. Urgent leads during quiet hours with night calls on start at `received_at`.
- **Within 5 minutes:** `acknowledged_at − clock_start ≤ 5 min`.
- The report prints this policy in a footnote, and lists after-hours leads separately.

Contents:
- Headline: eligible leads, % acknowledged within 5 minutes, leads needing attention.
- Lead volume by day.
- Needs attention: slow acknowledgments, ladders that ended unacknowledged, no recorded contact.
- Self-reported vs system-verified contact, labeled. No invented revenue figures.
- A shareable link (signed, read-only, 14 days) for a partner or office manager.
- For agencies: one report per client plus a roll-up.

## 17. Pricing and billing behavior

- One plan: **$49 / location / month**, escalation included. Unlimited legitimate lead records; published fair-use limits on outbound SMS and voice (set after usage modeling).
- Agency wholesale: **$29 / location / month**. Stripe Billing with a 14-day trial.

**Billing never silently disables alerts [S6]:**

| `billing_status` | Alert behavior | User sees |
| --- | --- | --- |
| `trialing`, `active` | Full ladder | — |
| `past_due` (days 1–7) | Full ladder | In-app banner + email + SMS notice on days 1, 4, 7 |
| `suspended` (days 8–21) | Email alerts only. Pending SMS/voice attempts are `skipped` with an `alert_skipped(billing)` event. | Every alert email carries "Text and call alerts are paused — update billing" |
| `canceled` (day 22+) | No alerts. Capture endpoints still store leads for 30 days. | A final notice 3 days before, and on the day |

## 18. Milestones and acceptance tests

### Milestone 1 — Truth Engine (must close M6, M7, S3, S4)
Supabase schema with composite FKs + RLS + grants, auth, memberships RPC, the WordPress plugin (Gravity Forms + Bricks first) with installation binding, `/api/v1/intake`, idempotency, spam scoring + quarantine, email-forward capture with sender trust, the append-only events table, and the prototype inbox wired to real leads.

- [ ] A real Gravity Forms submission and a real Bricks form submission each create exactly one lead; retrying the same `event_id` 5× still yields one.
- [ ] A bad signature, stale timestamp, revoked key, or key from another installation → 401, and no lead.
- [ ] A malicious authenticated user in account A cannot read, insert, update or reference account B's leads, contacts, attempts, events, tokens or memberships, even with hand-built ids. A member cannot raise their own role.
- [ ] A forged email sent 20× to a known forwarding address creates `needs_review` leads and zero calls.
- [ ] A spammy submission is quarantined; releasing it creates a `released` event and starts step 0.
- [ ] Same phone, different message within 10 min → two leads, linked, two ladders. Near-identical while the original is active → linked, no second ladder.

### Milestone 2 — Response Engine (must close M1, M2, M3, M4, M5, M8, S1)
Resend email, Twilio SMS + voice, ack codes, rescue links, the four acknowledgment paths, the dispatcher with eligibility + fencing + reconciler, quiet hours, backup consent, STOP handling, SMS activation states, compliance gates.

- [ ] **Branch A:** acknowledged at 3:00 → no call; the timeline shows notified → acknowledged.
- [ ] **Branch B:** no acknowledgment → reminder at 2:00, call at 5:00, press 1 → acknowledged; no backup alert.
- [ ] **Branch C:** call unanswered or voicemail → backups at 7:00, only those who replied YES; the ladder ends at 30:00 and nothing else is sent.
- [ ] **[M1]** Three leads at 10:00, 10:01 and 10:02; replies arrive out of order with codes → each code acknowledges its own lead. A bare `1` with three open leads → the disambiguation reply, nothing acknowledged.
- [ ] **[M2]** Close or quarantine an unacknowledged lead at 4:59 → no 5:00 call.
- [ ] **[M3]** Crash the worker right after Twilio accepts the call, before our DB records it → the attempt becomes `uncertain`, settles from Twilio, and no second call for that step. A stale worker with an expired lease can't dispatch.
- [ ] **[M4]** A backup revokes consent (or sends STOP) one second before dispatch → no SMS or call is initiated after the revocation commits. A quiet-hours change and a DST transition are honored for already-queued attempts.
- [ ] **[M5]** Opening a rescue link with a link scanner does not acknowledge. A forwarded link can't read other leads or assign across accounts; it's invalid after the contact is removed.
- [ ] **[M8]** Replayed callbacks, wrong SIDs, out-of-order statuses, and callbacks after acknowledgment don't change ownership or restart a ladder.
- [ ] An ack arriving during dispatch causes at most one ring, and the TwiML says it's handled.
- [ ] `sms_status = pending_verification` → SMS skipped, email sent, banner shown.

### Milestone 3 — Accountability Engine (must close S2, S5, S6)
Full UI on real data, timeline, integration health + source-count reconciliation, weekly report, Stripe billing states, the agency account switcher, the native widget, and the ops page.

- [ ] The weekly report matches a SQL query over `lead_events` for a seeded week, including released, after-hours and duplicate leads per §16.
- [ ] Source counts vs stored leads reconcile daily for each pilot site; a forced mismatch raises an alarm.
- [ ] Drills: dispatcher outage of 10 min (backlog drains, no duplicate calls), invalid webhooks, stale jobs.
- [ ] past_due → suspended → canceled follows §17, with notices sent and no silent alert loss.

**Launch gate:** 3 of Matt's existing clients live for 2 weeks; ≥ 90% of eligible leads acknowledged within 5 minutes; source-count reconciliation shows zero lost leads; all M- and S-items closed.

## 19. Before coding: Matt's checklist

- [ ] Form or confirm the legal entity + EIN for My Office Bot.
- [ ] Twilio account → start A2P 10DLC brand + campaign registration (1–3 weeks).
- [ ] Vercel Pro and a Supabase project.
- [ ] Domain decision, plus a USPTO search for "My Office Bot" and similar marks before spending on branding.
- [ ] Pick 3 design-partner clients on WordPress (ideally using Gravity Forms or Bricks forms).
