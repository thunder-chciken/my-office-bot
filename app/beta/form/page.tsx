import type { Metadata } from "next";

// A plain HTML form that posts straight to the intake endpoint — the same thing a contractor's
// website does. Open /beta/form?key=SITE_KEY to send a real test lead.

export const metadata: Metadata = { title: "Request an estimate — My Office Bot beta", robots: { index: false } };

export default async function BetaForm({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;

  return (
    <main className="beta-page">
      <div className="beta-card">
        <p className="beta-eyebrow">My Office Bot · beta test form</p>
        <h1 className="beta-title">Request an estimate</h1>
        <p className="muted">
          Fill this out like a homeowner would. The alert lands in the inbox of everyone set up for email alerts.
        </p>

        {key ? (
          <form className="form" action={`/api/v1/forms/${encodeURIComponent(key)}`} method="POST">
            <label className="field">
              <span>Your name</span>
              <input name="name" autoComplete="name" required />
            </label>
            <label className="field">
              <span>Phone</span>
              <input name="phone" inputMode="tel" autoComplete="tel" />
            </label>
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" inputMode="email" autoComplete="email" />
            </label>
            <label className="field">
              <span>What do you need?</span>
              <select name="service" defaultValue="Roof repair" className="beta-select">
                <option>Roof repair</option>
                <option>Roof replacement</option>
                <option>AC / heating</option>
                <option>Bathroom remodel</option>
                <option>Tile</option>
                <option>Other</option>
              </select>
            </label>
            <label className="field">
              <span>Address</span>
              <input name="address" autoComplete="street-address" />
            </label>
            <label className="field">
              <span>Message</span>
              <textarea name="message" rows={4} className="beta-textarea" />
            </label>
            {/* Honeypot: real people never see or fill this. */}
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="beta-honeypot" />
            <button className="btn btn-primary btn-block btn-xl" type="submit">
              Send request
            </button>
          </form>
        ) : (
          <p className="empty">This test form needs a site key: open it with ?key=… at the end of the address.</p>
        )}
      </div>
    </main>
  );
}
