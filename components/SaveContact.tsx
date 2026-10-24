"use client";

import { useState } from "react";
import { Contact as ContactIcon } from "lucide-react";
import { useAccount } from "@/lib/account";
import { cardFileName, vcard, type CardPerson } from "@/lib/vcard";
import { contactCardLink } from "@/app/api/v1/vcard/actions";

// "Save to phone contacts" (D55). Signed in: asks the server for a signed card link, then opens it in
// place, which shows iPhone's "Create New Contact" card and Android's "Open with Contacts". Demo: builds
// the same card in the browser from the sample data.
export function SaveContactButton({
  kind,
  id,
  person,
  className = "btn btn-soft btn-block",
}: {
  kind: "lead" | "customer";
  id: string;
  person: CardPerson;
  className?: string;
}) {
  const { live } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = async () => {
    setError("");
    if (live) {
      setBusy(true);
      const { url, error } = await contactCardLink(kind, id);
      setBusy(false);
      if (!url) return setError(error ?? "Couldn't make the contact card.");
      window.location.assign(url);
      return;
    }
    const file = new File([vcard(person)], cardFileName(person.name), { type: "text/vcard" });
    const href = URL.createObjectURL(file);
    window.location.assign(href);
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  return (
    <>
      <button className={className} onClick={open} disabled={busy}>
        <ContactIcon size={22} strokeWidth={2.4} /> {busy ? "Opening…" : "Save to phone contacts"}
      </button>
      {error && <p className="auth-error save-contact-error">{error}</p>}
    </>
  );
}
