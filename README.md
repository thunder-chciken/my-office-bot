# My Office Bot

Instant lead alerts for home service pros — roofers, HVAC, remodelers, tile, plumbing. When someone fills out the contact form on your website, the right people get a text, an email, or a phone call within seconds, and can reply with one tap.

This repo is the **clickable prototype**: an Apple-style mobile web app with mock data, plus a working webhook endpoint that accepts form posts.

## Screens

- **Leads** — new leads up top with big Call / Text buttons. Tap a lead for details, one-tap quick texts, status, and alert history.
- **Alerts** — who gets notified and how (Text / Email / Call per person), "call me if nobody replies" timer, after-hours and emergency rules.
- **Website** — connection status, three ways to hook up a form, and **Send a test lead** to see the alert flow.
- **Business** — profile, weekly stats, trades, account.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. On a computer it shows inside a phone frame; on a phone it fills the screen. Add it to your Home Screen for the full-app feel.

## Test the webhook

```bash
curl -X POST http://localhost:3000/api/leads/bb-2841 -H "Content-Type: application/json" -d "{\"name\":\"Test\",\"phone\":\"5125550100\",\"message\":\"Roof leak\"}"
```

## Deploy

Import this GitHub repo in Vercel. No settings or environment variables needed for the prototype.

## Plan

- [docs/SPEC.md](docs/SPEC.md): the v1 build spec (data model, escalation ladder, dispatcher, capture, security, compliance, milestones and acceptance tests).
- [docs/DECISIONS.md](docs/DECISIONS.md): settled product and architecture decisions.
- [docs/STACK.md](docs/STACK.md): stack and how a lead flows.
- [docs/COSTS.md](docs/COSTS.md): hosting choice, every service's cost, one-time costs, per-lead scenarios, growth stages and upgrade triggers.
