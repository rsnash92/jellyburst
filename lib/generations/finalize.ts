import { createAdminClient } from "@/lib/supabase/admin";
import { rehostOutputs } from "@/lib/storage";

// The SINGLE race-safe terminal-transition gate, shared by the webhook (02-02) and the
// reconciler (02-03). The `.in('status', ['queued','processing'])` predicate guarantees
// exactly one finaliser wins, so the two paths can never double-resolve or double-refund.

export async function finalizeCompleted(
  genId: string,
  outputs: string[],
  raw: unknown
): Promise<boolean> {
  const admin = createAdminClient();

  // Need user_id to build the storage path.
  const { data: row } = await admin
    .from("generations")
    .select("user_id, status")
    .eq("id", genId)
    .maybeSingle();
  if (!row) return false; // unknown row
  if (row.status === "completed" || row.status === "failed") return false; // already terminal

  const paths = await rehostOutputs(row.user_id as string, genId, outputs);

  // Race-safe conditional update — only the winning writer flips the row.
  const { data } = await admin
    .from("generations")
    .update({
      status: "completed",
      output_urls: paths,
      wavespeed_raw: raw,
      completed_at: new Date().toISOString(),
    })
    .eq("id", genId)
    .in("status", ["queued", "processing"])
    .select("id");

  return !!(data && data.length > 0);
}

export async function finalizeFailed(
  genId: string,
  error: string,
  raw?: unknown
): Promise<boolean> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("generations")
    .update({
      status: "failed",
      error,
      wavespeed_raw: raw ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", genId)
    .in("status", ["queued", "processing"])
    .select("id");

  const won = !!(data && data.length > 0);
  if (won) {
    // Refund stub (Phase 2): NO credit_ledger yet — wired in Phase 4, idempotent per generation_id.
    // refundForGeneration(genId)  <-- intentionally a no-op here.
  }
  return won;
}
