import { NextResponse } from "next/server";
import { handleFormSubmission } from "@/lib/server/intake";

// Public form endpoint. Works three ways:
//  1. A plain HTML <form action="https://myofficebot.app/api/v1/forms/KEY" method="POST">
//  2. fetch()/JSON from a website or widget
//  3. Webhooks from form plugins (Gravity Forms, WPForms, Contact Form 7, Bricks, Zapier)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteKey: string }> }) {
  const { siteKey } = await params;
  const type = req.headers.get("content-type") ?? "";
  const isHtmlForm = !type.includes("application/json") && (req.headers.get("accept") ?? "").includes("text/html");

  let raw: Record<string, unknown>;
  try {
    raw = type.includes("application/json")
      ? ((await req.json()) as Record<string, unknown>)
      : Object.fromEntries(await req.formData());
  } catch {
    return respond(isHtmlForm, 400, { ok: false, error: "We couldn't read that form" });
  }

  try {
    const result = await handleFormSubmission(siteKey, raw, {
      pageUrl: (typeof raw._page === "string" ? raw._page : null) ?? req.headers.get("referer"),
    });
    return respond(isHtmlForm, result.status, result.body);
  } catch (e) {
    console.error("form intake failed", e);
    return respond(isHtmlForm, 500, { ok: false, error: "Something went wrong — please call us instead" });
  }
}

function respond(html: boolean, status: number, body: { ok: boolean; error?: string }) {
  if (!html) return NextResponse.json(body, { status, headers: cors });
  const title = body.ok ? "Thanks — your request was sent" : "Sorry, that didn't go through";
  const text = body.ok
    ? "We got your message and will be in touch shortly."
    : (body.error ?? "Please try again or give us a call.");
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#F3F8FF;font-family:-apple-system,Segoe UI,Arial,sans-serif">
<main style="max-width:420px;margin:24px;background:#fff;border:1px solid #E4EAF2;border-radius:24px;padding:32px;text-align:center">
<div style="font-size:48px">${body.ok ? "✅" : "⚠️"}</div>
<h1 style="font-size:26px;color:#0B1A2E;margin:12px 0 8px">${title}</h1>
<p style="font-size:18px;color:#44546B;line-height:1.5;margin:0 0 24px">${text}</p>
<a href="javascript:history.back()" style="display:inline-block;padding:14px 24px;border-radius:14px;background:#0A6CFF;color:#fff;font-weight:600;text-decoration:none">Go back</a>
</main></body></html>`;
  return new NextResponse(page, { status: body.ok ? 200 : status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
