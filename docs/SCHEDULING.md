# Scheduling calendar — plan (R&D 010)

Planned 2026-10-23 by Claude and ChatGPT ("Jake"), for Matt.

**Build status (2026-10-23):**
- **Database: live.** `supabase/migrations/0003_scheduling.sql` is run, and the conflict rule passes `supabase/tests/scheduling_conflicts.sql`.
- **App: saves to the database** (2026-10-24, migration 0008). Bookings, moves, status changes and jobs created from leads all persist.
- **Evening-before crew email: built** (2026-10-24). Daily Vercel cron at 23:00 UTC, logged in `schedule_notifications`; admin can send it on demand.
- **Not yet:** creating and editing crews in the app (crews table exists; assign people directly for now).

**The one-line rule:** the calendar should feel like an extension of the lead inbox, not the start of another ServiceTitan. Any scheduling action should take fewer steps than opening the contractor's own calendar app and adding the event by hand.

## What it's for

Contractors (roofers, HVAC, remodelers, tile) need to know two things:

1. **Where they're going.** Estimates, inspections and service calls.
2. **Where their crews are committed.** Multi-day jobs: a roof tear-off Mon–Wed, or tile over two weeks.

A calendar that only handles appointments solves half the problem, so both are in the first release.

## Release plan

### MVP (free beta)

- **Lead → appointment in one tap.** Name, address and phone carry over from the lead.
- **Event types:**
  - appointment (estimate, inspection, service call)
  - project block (multi-day job)
  - unavailable (time off, truck in the shop)
- **Assign a person or a crew**, with a visible conflict warning. A manager can override a conflict by recording a reason.
- **Views:**
  - Today: the screen in the truck
  - Week
  - Month: a full calendar grid (added 2026-10-24). Colored bars on phones; time and name on tablets and desktop. Tap a day for its bookings, tap a booking to open it.
  - List
  - Unscheduled ("To do"): jobs that still need a date
- **Email reminders to the assigned staff.**
  - Homeowner reminders need permission, and their own notification step the contractor confirms.
- **Manual reschedule** with a date picker. Before saving, a confirmation screen shows exactly who will be notified.
- Phone-first, Apple-simple: big buttons, no drag-and-drop yet.

### V2 (convenience)

- **Homeowner booking link:** the homeowner picks an estimate slot from the contractor's working hours, with buffer times.
- **Read-only calendar feed (.ics)** for Google, Apple and Outlook calendars. It refreshes slowly, so it is never used for double-booking checks.
- **"Move project to next workday"** in one tap. It keeps the duration and crew and previews conflicts first.
- Bulk crew reassignment; drag-and-drop on larger screens.
- Homeowner text reminders, once 10DLC registration and consent are in place (SPEC v1.1).

### Later

- Two-way Google Calendar sync. It needs OAuth, tokens, webhooks, dedupe and recovery, so it isn't worth it before demand is proven.
- Weather-aware suggestions. Never automatic moves.
- Recurring service plans, route optimization, advanced dispatch.

## Data model (sketch)

Every table carries `account_id`, with composite tenant foreign keys and RLS, the same pattern as `0001_init.sql`.

| Table | Holds |
| --- | --- |
| `jobs` | customer, address, `lead_id` (optional), status, description |
| `schedule_events` | `type` (appointment / work_block / unavailable), `job_id`, `starts_at`, `ends_at`, `all_day`, `timezone`, `status`, optional homeowner **arrival window** |
| `crews` / `crew_members` | crew name and its members (contacts) |
| `event_assignments` | event → crew or person |

Rules:

- **Half-open time ranges `[start, end)`.** A job ending at noon doesn't conflict with one starting at noon.
- **Conflicts are checked in the database, in the same transaction as the save**, not only in the UI.
  - A person reached through two crews counts once.
  - An override stores who overrode it and why.
- **A multi-day project is one block: a date range plus daily working hours.**
  - A Mon–Wed roof job reserves 8–5 each day.
  - It does not reserve a solid 72 hours.
  - Per-day crew changes can come later.
- **The scheduled start and the homeowner arrival window are separate fields.** For example, a tech can arrive between 9 and 11 for a job scheduled to start at 9.

## Guardrails

- **Scheduling must not touch the lead-alert pipeline.**
  - It gets its own tables, code and tests.
  - Its only link to a lead is `lead_id`.
- **A failed reminder never cancels or moves an appointment.**
  - Delivery status is recorded.
  - The contractor always has a manual way to send it.
- **Conflict warnings only cover My Office Bot assignments.** The app says so, because personal Google/Apple events aren't visible until sync exists.

## Copy and avoid

| Product | Copy | Avoid |
| --- | --- | --- |
| Jobber | Visual, color-coded schedule | Bulk-scheduling complexity; weak mobile admin |
| Housecall Pro | Unscheduled-work tray; per-employee views; customer-notify choice | No real crew concept |
| ServiceTitan | Clear dispatched / working / done states; fast rescheduling | A dispatch control center small contractors don't need |

## Acceptance scenario (has to work smoothly on a phone)

1. A roofer gets a lead, creates an inspection for Tuesday and assigns Crew A.
2. Crew A is already booked, so the app shows a conflict.
3. The roofer sends a confirmation.
4. The next week, they schedule a three-day roof job.
5. It rains, so they shift the job by one workday.
6. The crew assignment survives the shift, and the wrong homeowner is not notified.
