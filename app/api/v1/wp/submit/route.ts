import { NextResponse } from "next/server";
import { handleFormSubmission } from "@/lib/server/intake";
import { notePluginSeen, verifyPluginRequest } from "@/lib/server/pluginAuth";

// A form submission forwarded by the WordPress plugin (D57). Signed with the site's plugin secret.
// Body: { event_id, builder, form_id, form_name, page_url, plugin_version, site_url,
//         fields: { name, first_name, last_name, phone, email, message, service, address } }
// The event id is made once per submission, so the plugin's retries are recognized as the same lead.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowed = ["name", "first_name", "last_name", "phone", "email", "message", "service", "address"];

export async function POST(request: Request) {
  const raw = await request.text();
  const site = await verifyPluginRequest(request, raw);
  if (!site) return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const eventId = typeof body.event_id === "string" ? body.event_id.slice(0, 100) : "";
  if (!eventId) return NextResponse.json({ ok: false, error: "missing event_id" }, { status: 400 });

  // Only the mapped contact fields are accepted; anything else the site sent is ignored.
  const input = (body.fields ?? {}) as Record<string, unknown>;
  const fields: Record<string, string> = { _event_id: `wp:${eventId}` };
  for (const k of allowed) if (typeof input[k] === "string") fields[k] = (input[k] as string).slice(0, 4000);

  await notePluginSeen(site.id, { version: body.plugin_version, siteUrl: body.site_url });
  try {
    const result = await handleFormSubmission(site.public_key, fields, {
      pageUrl: typeof body.page_url === "string" ? body.page_url : null,
      channel: "plugin",
      extra: {
        builder: typeof body.builder === "string" ? body.builder.slice(0, 40) : "wordpress",
        form: typeof body.form_name === "string" && body.form_name ? body.form_name.slice(0, 120) : String(body.form_id ?? "").slice(0, 60),
      },
    });
    // 4xx from intake (e.g. no phone or email) is final: the plugin must not keep retrying it.
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error("plugin intake failed", e);
    return NextResponse.json({ ok: false, error: "temporary error" }, { status: 503 });
  }
}
