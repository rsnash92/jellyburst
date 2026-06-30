import { NextResponse } from "next/server";

import { finalizeCompleted, finalizeFailed } from "@/lib/generations/finalize";
import { verifyWebhook } from "@/lib/wavespeed";

export const runtime = "nodejs";

// Inbound WaveSpeed completion callback. Verify the Svix signature over the RAW body BEFORE
// any parse or write. Resolve via the shared race-safe finalize engine (idempotent on double-fire).
export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifyWebhook(rawBody, request.headers)) {
    // Reject forged/unsigned calls before touching the DB or Storage.
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const url = new URL(request.url);
  const genId = url.searchParams.get("gen");
  if (!genId) {
    return NextResponse.json({ error: "missing gen" }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // Payload may be the prediction object directly or wrapped in { data }.
  const env = parsed as { data?: Record<string, unknown> } & Record<string, unknown>;
  const d = (env.data ?? env) as {
    status?: string;
    outputs?: string[];
    error?: string;
    code?: number;
  };

  // Only re-host URLs that arrived inside this signature-verified payload (SSRF guard).
  if (d.status === "completed") {
    await finalizeCompleted(genId, Array.isArray(d.outputs) ? d.outputs : [], parsed);
  } else if (d.status === "failed") {
    await finalizeFailed(genId, d.error || `wavespeed code ${d.code ?? "unknown"}`, parsed);
  }
  // Non-terminal statuses: acknowledge without writing.

  // 200 so WaveSpeed stops retrying, even if the row was already terminal (idempotent no-op).
  return NextResponse.json({ ok: true });
}
