import { NextResponse } from "next/server";
import { readCardToken } from "@/lib/server/cardLink";
import { adminDb } from "@/lib/server/db";
import { cardFileName, vcard } from "@/lib/vcard";

// "Save to phone contacts": /api/v1/vcard?t=SIGNED_TOKEN returns a contact card (D55).
// The token proves the signed-in person was allowed to see this lead/customer when the link was made,
// so the card opens even in a browser window that isn't signed in. Served "inline" so iPhone shows
// its Add to Contacts card and Android offers to open it in Contacts.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const target = readCardToken(token);
  if (!target) return new NextResponse("This contact link has expired. Open the lead again and tap Save to phone contacts.", { status: 404 });

  const db = adminDb();
  let person: { name: string; phone: string | null; email: string | null; address: string | null; note: string | null } | null = null;
  if (target.kind === "customer") {
    const { data } = await db.from("customers").select("name, phone, email, address, notes").eq("id", target.id).maybeSingle();
    if (data) person = { ...data, note: data.notes };
  } else {
    const { data } = await db.from("leads").select("name, phone, email, address, service").eq("id", target.id).maybeSingle();
    if (data) person = { name: data.name ?? "", phone: data.phone, email: data.email, address: data.address, note: data.service ? `Lead: ${data.service}` : null };
  }
  if (!person) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(vcard(person), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `inline; filename="${cardFileName(person.name)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
