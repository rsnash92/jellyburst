import crypto from "node:crypto";

// SERVER-ONLY WaveSpeed client. NEVER import from a client component.
// Wire shape confirmed live 2026-06-30 (see 02-01-SUMMARY): envelope `{ code, message, data }`,
// submit path IS the model id, webhook attaches via the `?webhook=` query param, status enum
// created/processing/completed/failed, outputs at data.outputs[].

const BASE = "https://api.wavespeed.ai/api/v3";

function authHeaders() {
  const key = process.env.WAVESPEED_API_KEY;
  if (!key) throw new Error("WAVESPEED_API_KEY is not set (server-only)");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export type SubmitResult = { taskId: string; status: string; pollUrl?: string };
export type GetResult = {
  status: string;
  outputs: string[];
  error?: string;
  code?: number;
  raw: unknown;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST /api/v3/{modelId}?webhook=<encoded>. Returns immediately with the task id.
export async function submitTask(
  path: string,
  body: Record<string, unknown>,
  webhookUrl: string
): Promise<SubmitResult> {
  const url = `${BASE}/${path}?webhook=${encodeURIComponent(webhookUrl)}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      code?: number;
      data?: { id?: string; status?: string; urls?: { get?: string } };
    };
    const data = json?.data;
    if (res.ok && data?.id) {
      return { taskId: data.id, status: data.status ?? "created", pollUrl: data.urls?.get };
    }
    // Retry only on transient server/timeout codes (5003/5004) — never on a 4xx.
    const code = json?.code;
    lastErr = new Error(`WaveSpeed submit failed (http ${res.status}, code ${code})`);
    if (res.status >= 500 || code === 5003 || code === 5004) {
      await sleep(400 * (attempt + 1));
      continue;
    }
    break;
  }
  throw lastErr ?? new Error("WaveSpeed submit failed");
}

// GET the prediction result. Prefer the poll URL the submit returned (avoids path drift).
export async function getResult(taskId: string, pollUrl?: string): Promise<GetResult> {
  const url = pollUrl || `${BASE}/predictions/${taskId}/result`;
  const res = await fetch(url, { headers: authHeaders() });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { status?: string; outputs?: string[]; error?: string; code?: number };
  };
  const d = json?.data ?? {};
  return {
    status: d.status ?? "unknown",
    outputs: Array.isArray(d.outputs) ? d.outputs : [],
    error: d.error || undefined,
    code: d.code,
    raw: json,
  };
}

// Numeric codes that mean "permanently failed" (refund-worthy) vs retryable.
export function isTerminalFailureCode(code?: number): boolean {
  if (code == null) return false;
  return [1200, 1400, 1401, 1402, 1403, 1405].includes(code);
}
export function isRetryableCode(code?: number): boolean {
  return code === 5000 || code === 5003 || code === 5004;
}

// Verify the inbound webhook signature (Svix-style HMAC-SHA256).
// Headers: webhook-id / webhook-timestamp / webhook-signature ("v3,<hex>" possibly space-separated).
// Signed content: `${id}.${timestamp}.${rawBody}`. Secret: WAVESPEED_WEBHOOK_SECRET (strip `whsec_`).
// The exact key encoding is the one live-untested detail, so we accept a match against a few
// standard candidate computations — all of which require knowing the secret, so this stays secure.
export function verifyWebhook(rawBody: string, headers: Headers): boolean {
  const secretEnv = process.env.WAVESPEED_WEBHOOK_SECRET;
  if (!secretEnv) return false;

  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !timestamp || !sigHeader) return false;

  // Reject stale/forged timestamps (±5 min).
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const base = secretEnv.startsWith("whsec_") ? secretEnv.slice(6) : secretEnv;

  // Candidate keys: the raw remainder (utf8) and its base64-decoded bytes.
  const keys: Buffer[] = [Buffer.from(base, "utf8")];
  try {
    keys.push(Buffer.from(base, "base64"));
  } catch {
    /* ignore */
  }

  const expected = new Set<string>();
  for (const k of keys) {
    const h = crypto.createHmac("sha256", k).update(signedContent);
    const digest = h.digest();
    expected.add(digest.toString("hex"));
    expected.add(digest.toString("base64"));
  }

  // Provided signatures: space-separated tokens, each "vN,<sig>" or bare.
  const provided = sigHeader
    .split(" ")
    .map((tok) => (tok.includes(",") ? tok.slice(tok.indexOf(",") + 1) : tok))
    .filter(Boolean);

  for (const p of provided) {
    for (const e of expected) {
      if (p.length === e.length && crypto.timingSafeEqual(Buffer.from(p), Buffer.from(e))) {
        return true;
      }
    }
  }
  return false;
}
