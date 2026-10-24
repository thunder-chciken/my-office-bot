import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy — My Office Bot" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="October 23, 2026">
      <p>
        My Office Bot helps home service businesses get website leads to their phone fast. This page explains what we
        collect, why, and what you can do about it. We don&apos;t sell personal information and we don&apos;t show ads.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <b>Your account:</b> your name, email address and the password you choose (stored only as a secure hash), or your
          Google name and email if you sign in with Google.
        </li>
        <li>
          <b>Your business:</b> business name, website, and the people you add to receive alerts, with their names, emails
          and phone numbers.
        </li>
        <li>
          <b>Leads:</b> what homeowners type into your website forms, such as name, phone, email, address and message. We
          hold these on your behalf so we can alert you; your business decides how to use them.
        </li>
        <li>
          <b>Schedules:</b> appointments and jobs you add to the calendar.
        </li>
        <li>
          <b>Technical records:</b> sign-in and delivery logs (for example, whether an alert email was sent), used to keep
          the service working and secure.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Only to run My Office Bot: deliver lead alerts, show your leads and schedule, keep accounts secure, filter spam and
        fix problems. We email you about your account and alerts. We don&apos;t use your data for advertising.
      </p>

      <h2>Who helps us run it</h2>
      <p>
        A few trusted providers process data for us: Supabase (database and sign-in), Vercel (hosting), Resend (email),
        Twilio (text and phone alerts), Cloudflare (domain), and Google (if you choose Google sign-in). They may only use
        the data to provide their service to us.
      </p>

      <h2>Cookies</h2>
      <p>We use a cookie only to keep you signed in. No tracking or advertising cookies.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep your account and leads while your account is open. If you delete your account, we delete your data within
        30 days, except records we must keep by law.
      </p>

      <h2>Your choices</h2>
      <p>
        You can update your details in the app, or email us to get a copy of your data or delete your account. Homeowners
        who sent a form to a business should contact that business first; we&apos;ll help with any request.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit, each business can only see its own records, and passwords are never stored in plain
        text. No system is perfect, so please tell us right away if you spot a problem.
      </p>

      <h2>Children</h2>
      <p>My Office Bot is for businesses and isn&apos;t meant for anyone under 18.</p>

      <h2>Changes and contact</h2>
      <p>
        If we change this policy, we&apos;ll update the date above and tell account owners about important changes.
        Questions: <a href="mailto:support@myofficebot.app">support@myofficebot.app</a>.
      </p>
    </LegalPage>
  );
}
