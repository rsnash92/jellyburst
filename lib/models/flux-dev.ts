// Single hardcoded model config for the Phase 2 vertical slice.
// The full config-driven registry (ModelDef/ModelField + dynamic form + Zod) is Phase 3.
// Input shape confirmed live: flux-dev accepts `{ prompt, size: "W*H" }`.

export const FLUX_DEV = {
  key: "flux-dev",
  label: "Flux Dev — Text to Image",
  category: "image" as const,
  wavespeedPath: "wavespeed-ai/flux-dev",
  outputType: "image" as const,
  creditCost: 0, // Phase 2: no credits
  sizes: ["1024*1024", "1024*1536", "1536*1024"] as const,
  defaultSize: "1024*1024",
};

export type FluxDevInput = { prompt: string; size?: string };

export function validateInput(input: unknown): { ok: true; value: Required<FluxDevInput> } | { ok: false; error: string } {
  const i = (input ?? {}) as Record<string, unknown>;
  const prompt = typeof i.prompt === "string" ? i.prompt.trim() : "";
  if (!prompt) return { ok: false, error: "prompt is required" };
  if (prompt.length > 2000) return { ok: false, error: "prompt too long (max 2000)" };
  let size = typeof i.size === "string" ? i.size : FLUX_DEV.defaultSize;
  if (!FLUX_DEV.sizes.includes(size as (typeof FLUX_DEV.sizes)[number])) {
    size = FLUX_DEV.defaultSize;
  }
  return { ok: true, value: { prompt, size } };
}

export function buildPayload(input: Required<FluxDevInput>): Record<string, unknown> {
  return {
    prompt: input.prompt,
    size: input.size,
    enable_sync_mode: false,
    enable_base64_output: false,
  };
}
