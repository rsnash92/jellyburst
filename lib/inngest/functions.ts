import { NonRetriableError } from "inngest";

import { finalizeCompleted, finalizeFailed } from "@/lib/generations/finalize";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResult, isTerminalFailureCode } from "@/lib/wavespeed";
import { inngest } from "./client";

// Rows older than this with no terminal state are genuinely late (webhook likely missed).
const STUCK_AFTER_MIN = 2;
// Force-fail past this so nothing is stuck forever (GEN-11).
const MAX_AGE_MIN = 15;

// Cron sweep: find stuck rows and fan out one retryable resolver per row. Stays tiny
// (query + emit) so it finishes well under the function timeout.
export const reconcileSweep = inngest.createFunction(
  { id: "reconcile-stuck-generations", triggers: [{ cron: "* * * * *" }] },
  async ({ step }) => {
    const rows = await step.run("find-stuck", async () => {
      const admin = createAdminClient();
      const cutoff = new Date(Date.now() - STUCK_AFTER_MIN * 60_000).toISOString();
      const { data } = await admin
        .from("generations")
        .select("id, wavespeed_task_id, created_at")
        .in("status", ["queued", "processing"])
        .lt("created_at", cutoff)
        .limit(200);
      return (data ?? []) as { id: string; wavespeed_task_id: string | null; created_at: string }[];
    });

    if (rows.length === 0) return { swept: 0 };

    await step.sendEvent(
      "fan-out",
      rows.map((r) => ({
        name: "generation/reconcile.requested",
        data: { generationId: r.id, taskId: r.wavespeed_task_id, createdAt: r.created_at },
      }))
    );
    return { swept: rows.length };
  }
);

// Per-row resolver: poll WaveSpeed Get-Result and resolve via the SHARED race-safe finalize
// engine (so it can never double-resolve against the webhook). Retries + concurrency-capped.
export const resolveGeneration = inngest.createFunction(
  {
    id: "resolve-generation",
    retries: 4,
    concurrency: 8,
    triggers: [{ event: "generation/reconcile.requested" }],
  },
  async ({ event, step }) => {
    const { generationId, taskId, createdAt } = event.data as {
      generationId: string;
      taskId: string | null;
      createdAt: string;
    };

    if (!taskId) throw new NonRetriableError("missing wavespeed_task_id");

    const result = await step.run("get-result", () => getResult(taskId));

    if (result.status === "completed") {
      await step.run("finalize-success", () =>
        finalizeCompleted(generationId, result.outputs, result.raw)
      );
      return { resolved: "completed" };
    }

    if (result.status === "failed" || isTerminalFailureCode(result.code)) {
      await step.run("finalize-failure", () =>
        finalizeFailed(generationId, result.error || `wavespeed code ${result.code ?? "unknown"}`, result.raw)
      );
      return { resolved: "failed" };
    }

    // Still queued/processing — force-fail only past the max-age ceiling.
    const ageMin = (Date.now() - new Date(createdAt).getTime()) / 60_000;
    if (ageMin > MAX_AGE_MIN) {
      await step.run("force-fail", () =>
        finalizeFailed(generationId, "reconcile-timeout", result.raw)
      );
      return { resolved: "timeout" };
    }

    return { resolved: "still-running" };
  }
);
