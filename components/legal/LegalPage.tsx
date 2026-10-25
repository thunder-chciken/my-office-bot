import Link from "next/link";
import type { ReactNode } from "react";
import { Mascot } from "../ui";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <Link href="/" className="auth-brand" aria-label="My Office Bot home">
          <Mascot size={44} />
          <span className="wordmark">
            My <span className="wordmark-blue">Office</span> Bot
          </span>
        </Link>
        <h1 className="auth-title">{title}</h1>
        <p className="muted">Last updated {updated}</p>
        {children}
        <p className="legal-foot">
          <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/features">What it does</Link> ·{" "}
          <Link href="/login">Sign in</Link>
        </p>
      </article>
    </main>
  );
}
