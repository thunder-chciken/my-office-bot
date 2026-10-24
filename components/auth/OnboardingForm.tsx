"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { AuthShell } from "./AuthForms";

export function OnboardingForm({ defaultName, email }: { defaultName: string; email: string }) {
  const router = useRouter();
  const [business, setBusiness] = useState("");
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await browserClient().rpc("create_my_account", {
      p_business_name: business.trim(),
      p_owner_name: name.trim(),
      p_phone: phone.trim() || null,
      p_website: website.trim() || null,
    });
    if (error) {
      setError("Couldn't set that up. Please try again.");
      setBusy(false);
      return;
    }
    router.replace("/app");
    router.refresh();
  };

  return (
    <AuthShell title="Set up your business" subtitle={`Signed in as ${email}. New leads will email you here.`}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Business name</span>
          <input autoComplete="organization" required value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Bluebird Roofing" />
        </label>
        <label className="field">
          <span>Your name</span>
          <input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Mobile number (optional)</span>
          <input inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(512) 555-0100" />
        </label>
        <label className="field">
          <span>Website (optional)</span>
          <input inputMode="url" autoComplete="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="bluebirdroofing.com" />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button className="btn btn-primary btn-block btn-xl" disabled={busy}>
          {busy ? "Setting up…" : "Finish"}
        </button>
      </form>
    </AuthShell>
  );
}
