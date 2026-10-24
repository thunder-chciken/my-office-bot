import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import { cardFileName, vcard } from "@/lib/vcard";

// "Save to phone contacts": /api/v1/vcard?customer=ID or ?lead=ID returns a contact card.
// Reads as the signed-in person (Row Level Security), so nobody can download another business's customers.
// Only ids go in the URL, never names or numbers.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const customerId = params.get("customer");
  const leadId = params.get("lead");
  const supabase = await serverClient();

  let person: { name: string; phone: string | null; email: string | null; address: string | null; note: string | null } | null = null;
  if (customerId) {
    const { data } = await supabase.from("customers").select("name, phone, email, address, notes").eq("id", customerId).maybeSingle();
    if (data) person = { ...data, note: data.notes };
  } else if (leadId) {
    const { data } = await supabase.from("leads").select("name, phone, email, address, service").eq("id", leadId).maybeSingle();
    if (data) person = { name: data.name ?? "", phone: data.phone, email: data.email, address: data.address, note: data.service ? `Lead: ${data.service}` : null };
  }
  if (!person) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(vcard(person), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${cardFileName(person.name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
