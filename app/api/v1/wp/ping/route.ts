import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/db";
import { notePluginSeen, verifyPluginRequest } from "@/lib/server/pluginAuth";

// "Test connection" from the WordPress plugin settings page (D57).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  const site = await verifyPluginRequest(request, raw);
  if (!site) return NextResponse.json({ ok: false, error: "That connection code isn't valid. Copy it again from My Office Bot." }, { status: 401 });

  let body: { plugin_version?: unknown; site_url?: unknown } = {};
  try {
    body = JSON.parse(raw);
  } catch {}
  await notePluginSeen(site.id, { version: body.plugin_version, siteUrl: body.site_url });
  const { data: acct } = await adminDb().from("accounts").select("name, billing_status").eq("id", site.account_id).maybeSingle();
  return NextResponse.json({ ok: true, business: acct?.name ?? "", paused: acct?.billing_status === "suspended" });
}
