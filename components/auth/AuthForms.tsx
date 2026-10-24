"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { browserClient } from "@/lib/supabase/client";
import { Mascot } from "../ui";

// Sign in, create an account, forgot password and set a new password.
// Google and email + password both go through Supabase Auth.

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-brand" aria-label="My Office Bot home">
          <Mascot size={48} />
          <span className="wordmark">
            My <span className="wordmark-blue">Office</span> Bot
          </span>
        </Link>
        <h1 className="auth-title">{title}</h1>
        {subtitle && <p className="muted auth-sub">{subtitle}</p>}
        {children}
      </div>
    </main>
  );
}

function friendly(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "That email and password don't match.";
  if (m.includes("email not confirmed")) return "Confirm your email first. Check your inbox for the link.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "There's already an account with that email. Sign in instead.";
  if (m.includes("password") && (m.includes("at least") || m.includes("weak") || m.includes("short")))
    return "Pick a longer password: at least 8 characters.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many tries. Wait a minute and try again.";
  return message;
}

function GoogleButton({ next, label }: { next: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setBusy(true);
    setError("");
    const { error } = await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError(friendly(error.message));
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="btn btn-block google-btn" onClick={go} disabled={busy}>
        <GoogleG /> {busy ? "Opening Google…" : label}
      </button>
      {error && <p className="auth-error">{error}</p>}
    </>
  );
}

function GoogleG() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

const Or = () => (
  <p className="auth-or">
    <span>or</span>
  </p>
);

// ---------------------------------------------------------------- sign in

export function SignInForm({ next, linkError }: { next: string; linkError: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(linkError ? "That link expired or was already used. Sign in, or ask for a new one." : "");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await browserClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(friendly(error.message));
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
  };

  return (
    <AuthShell title="Sign in" subtitle="Welcome back.">
      <GoogleButton next={next} label="Continue with Google" />
      <Or />
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button className="btn btn-primary btn-block btn-xl" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="auth-links">
        <Link href="/forgot">Forgot password?</Link>
        <Link href={`/signup${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link>
      </p>
    </AuthShell>
  );
}

// ---------------------------------------------------------------- create an account

export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [resent, setResent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Pick a longer password: at least 8 characters.");
    setBusy(true);
    setError("");
    const { data, error } = await browserClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding`,
      },
    });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    // An existing, confirmed email comes back with no identities (Supabase hides whether it exists).
    if (data.user && data.user.identities?.length === 0) {
      return setError("There's already an account with that email. Sign in instead.");
    }
    if (data.session) {
      router.replace("/onboarding");
      router.refresh();
    } else setSentTo(email.trim());
  };

  const resend = async () => {
    await browserClient().auth.resend({
      type: "signup",
      email: sentTo,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding` },
    });
    setResent(true);
  };

  if (sentTo) {
    return (
      <AuthShell title="Check your email">
        <div className="auth-sent">
          <MailCheck size={44} strokeWidth={2.2} />
          <p>
            We sent a link to <b>{sentTo}</b>. Tap it to finish creating your account.
          </p>
        </div>
        <p className="muted auth-small">Not there? Check spam, or send it again.</p>
        <button className="btn btn-soft btn-block" onClick={resend} disabled={resent}>
          {resent ? "Sent again" : "Send the link again"}
        </button>
        <p className="auth-links">
          <Link href="/login">Back to sign in</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="Free during the beta. Takes a minute.">
      <GoogleButton next="/onboarding" label="Sign up with Google" />
      <Or />
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Your name</span>
          <input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <p className="muted auth-small">At least 8 characters.</p>
        {error && <p className="auth-error">{error}</p>}
        <button className="btn btn-primary btn-block btn-xl" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="auth-links">
        <span className="muted">Have an account?</span> <Link href="/login">Sign in</Link>
      </p>
      <p className="muted auth-legal">
        By creating an account you agree to the <Link href="/terms">Terms</Link> and{" "}
        <Link href="/privacy">Privacy policy</Link>.
      </p>
    </AuthShell>
  );
}

// ---------------------------------------------------------------- forgot / reset password

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await browserClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth/callback?next=/reset`,
    });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    setSent(true);
  };

  return (
    <AuthShell title="Reset your password" subtitle={sent ? undefined : "We'll email you a link to pick a new one."}>
      {sent ? (
        <div className="auth-sent">
          <MailCheck size={44} strokeWidth={2.2} />
          <p>
            If there's an account for <b>{email.trim()}</b>, a reset link is on its way.
          </p>
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="btn btn-primary btn-block btn-xl" disabled={busy}>
            {busy ? "Sending…" : "Email me a link"}
          </button>
        </form>
      )}
      <p className="auth-links">
        <Link href="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}

export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Pick a longer password: at least 8 characters.");
    setBusy(true);
    setError("");
    const { error } = await browserClient().auth.updateUser({ password });
    if (error) {
      setError(friendly(error.message));
      setBusy(false);
      return;
    }
    router.replace("/app");
    router.refresh();
  };

  return (
    <AuthShell title="Pick a new password">
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>New password</span>
          <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <p className="muted auth-small">At least 8 characters.</p>
        {error && <p className="auth-error">{error}</p>}
        <button className="btn btn-primary btn-block btn-xl" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </AuthShell>
  );
}
