"use client";

import { Contact as ContactIcon } from "lucide-react";
import { useAccount } from "@/lib/account";
import { cardFileName, vcard, type CardPerson } from "@/lib/vcard";

// "Save to phone contacts". Signed in: downloads the card from the server, which checks the person may see it.
// Demo: builds the same card in the browser from the sample data.
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

  if (live) {
    return (
      <a className={className} href={`/api/v1/vcard?${kind}=${encodeURIComponent(id)}`} download={cardFileName(person.name)}>
        <ContactIcon size={22} strokeWidth={2.4} /> Save to phone contacts
      </a>
    );
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([vcard(person)], { type: "text/vcard" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = cardFileName(person.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <button className={className} onClick={download}>
      <ContactIcon size={22} strokeWidth={2.4} /> Save to phone contacts
    </button>
  );
}
