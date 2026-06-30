import { NextResponse } from "next/server";

import { FLUX_DEV, buildPayload, validateInput } from "@/lib/models/flux-dev";
import { createClient } from "@/lib/supabase/server";
import { submitTask } from "@/lib/wavespeed";

export const runtime = "nodejs";

// POST /api/generate — authed, validates, submits to WaveSpeed with our webhook callback,
// inserts a queued generations row, and returns { generationId } IMMEDIATELY (never blocks).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: { modelKey?: string; input?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (payload.modelKey !== FLUX_DEV.key) {
    return NextResponse.json({ error: "unknown modelKey" }, { status: 400 });
  }

  const validated = validateInput(payload.input);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    return NextResponse.json({ error: "APP_URL not configured" }, { status: 500 });
  }

  const generationId = crypto.randomUUID();
  const callback = `${appUrl}/api/webhooks/wavespeed?gen=${generationId}`;

  let submit;
  try {
    submit = await submitTask(FLUX_DEV.wavespeedPath, buildPayload(validated.value), callback);
  } catch (err) {
    // Submit failed — insert NO row.
    return NextResponse.json(
      { error: "generation submit failed", detail: String((err as Error).message) },
      { status: 502 }
    );
  }

  // Insert via the USER-SCOPED client so RLS enforces user_id = auth.uid().
  // Map WaveSpeed `created` -> our `queued`.
  const { error: insertError } = await supabase.from("generations").insert({
    id: generationId,
    user_id: user.id,
    model_key: FLUX_DEV.key,
    category: FLUX_DEV.category,
    status: "queued",
    input: validated.value,
    credit_cost: 0,
    wavespeed_task_id: submit.taskId,
  });

  if (insertError) {
    return NextResponse.json(
      { error: "failed to record generation", detail: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ generationId });
}
