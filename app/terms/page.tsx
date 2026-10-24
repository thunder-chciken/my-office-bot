import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Terms — My Office Bot" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="October 23, 2026">
      <p>
        These terms cover your use of My Office Bot. By creating an account or using the service, you agree to them. If you
        use it for a business, you&apos;re agreeing for that business.
      </p>

      <h2>The beta</h2>
      <p>
        My Office Bot is in a free beta. Features will change, and we may pause or end the beta. We&apos;ll give account
        owners notice before we start charging, and nothing is billed without your agreement.
      </p>

      <h2>Alerts are a backup, not a guarantee</h2>
      <p>
        We work hard to deliver every lead quickly, but email, text and phone networks, websites and our own systems can
        fail or be delayed. Keep your usual way of receiving website leads in place, and don&apos;t rely on My Office Bot
        as your only record of a customer or for emergencies.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Give accurate information and keep your password safe. You&apos;re responsible for activity in your account.</li>
        <li>Only add people to alerts who have agreed to receive them, and keep their details current.</li>
        <li>Only connect websites and forms you own or are allowed to manage.</li>
      </ul>

      <h2>Fair use</h2>
      <p>
        Don&apos;t use My Office Bot to send spam, harass anyone, break the law, or try to access other accounts or disrupt
        the service. We may suspend accounts that do.
      </p>

      <h2>Your data</h2>
      <p>
        Your leads, contacts and schedule belong to you. You let us store and process them only to run the service, as
        described in our <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>Ending your account</h2>
      <p>You can stop using My Office Bot at any time and ask us to delete your account.</p>

      <h2>No warranty and limits on liability</h2>
      <p>
        The beta is provided “as is,” without warranties of any kind. To the extent the law allows, My Office Bot isn&apos;t
        liable for lost leads, lost profits or indirect damages, and our total liability for any claim is limited to the
        amount you paid us in the 12 months before it (during the free beta, that&apos;s $0).
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms; we&apos;ll change the date above and tell account owners about important changes. These
        terms are governed by the laws of Texas. Questions:{" "}
        <a href="mailto:support@myofficebot.app">support@myofficebot.app</a>.
      </p>
    </LegalPage>
  );
}
