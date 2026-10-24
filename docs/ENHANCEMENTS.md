# Creature comforts — plan (R&D 011)

Agreed 2026-10-24 by Claude and ChatGPT ("Jake"), for Matt. Status: **plan, not built.**

**The rule:** make what's already built faster, more convenient and harder to forget. No new product lines (no invoicing, CRM, AI receptionist, payments or marketing). The goal: open the app, see what needs attention, act, and get back to work. Fewer taps.

Effort: S = hours to a day · M = 1–3 days.

## Pass 1 — Immediate usability

| # | What | Effort | Why |
| --- | --- | --- | --- |
| 1 | **Live refresh.** New leads appear without reloading: refresh when the app comes back on screen, pull-to-refresh, and a light check every 30 seconds while it's open (paused in the background, never two at once). | S–M | Today a new lead only shows after a reload. |
| 2 | **Lead notes.** Quick notes on a lead ("left voicemail", "wants a quote by Friday"), also shown on the customer. | S | The number-one thing contractors keep in their heads or on scraps of paper. |
| 3 | **Recently viewed customers.** The last 3–5 customers opened, at the top of Customers. | S | Look up an address, jump to the schedule, then need their number again without searching twice. |

## Pass 2 — Personal organization

| # | What | Effort | Why |
| --- | --- | --- | --- |
| 4 | **Follow-up reminders.** "In 2 hours", "Tomorrow morning" or "Pick a date" on a lead. Due ones show at the top of Today / To do until done, plus a reminder email to whoever set it. Kept separate from the crew email. | M | Stops warm leads going cold. |
| 5 | **One search box.** Find a homeowner by name, phone, address or job across leads, customers and the schedule. | M | No remembering which tab something is in. |
| 6 | **Your own quick replies, up to 10 per business** (Matt's call; 10 keeps the list scannable on a phone). Write them in your own words, with the customer's first name filled in and a preview; reorder and delete; start from the 4 built-in ones. Tapping one opens the phone's Messages with the text ready, as today. | S–M | The built-in replies won't fit every business. |

## Pass 3 — Finishing touches

| # | What | Effort | Why |
| --- | --- | --- | --- |
| 7 | **Undo.** A few seconds to undo deleting a customer or canceling a booking, backed by records that are really recoverable (customers soft-deleted, bookings marked canceled). | S–M | One wrong tap shouldn't lose a customer. |
| 8 | **Monday summary email.** Last week's new leads, bookings, open follow-ups and reply times. | M | A 30-second weekly check-in. |
| 9 | **Page-source tag.** A small tag showing which page of the website the lead came from. No "Google Ads" claims without real tracking. | S | Hints at what's working, honestly. |

Small polish along the way: "Schedule a visit" suggests the next open time (checked against conflicts and working hours) for the contractor to confirm, never chosen automatically.

## Later, not now

- Dark mode: nice, but lower daily value than saving taps.
- Sound and vibration on a new lead: phones handle these inconsistently in web apps.
- Photos on leads and jobs: storage, uploads, resizing and retention make it bigger than a creature comfort.

## Rules for all of it

Notes, reminders and search stay inside each business's own data, enforced in the database the same way as everything else.
