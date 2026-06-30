"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FLUX_DEV } from "@/lib/models/flux-dev";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "queued" | "processing" | "completed" | "failed";

export default function StudioClient() {
  const supabase = useRef(createClient());
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<string>(FLUX_DEV.defaultSize);
  const [status, setStatus] = useState<Status>("idle");
  const [genId, setGenId] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Honest elapsed-time counter while running.
  useEffect(() => {
    if (status !== "queued" && status !== "processing") return;
    const t = setInterval(() => {
      if (startedAt) setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [status, startedAt]);

  const loadSignedUrls = useCallback(async (id: string) => {
    const res = await fetch(`/api/generations/${id}/signed-urls`);
    if (!res.ok) return;
    const data = (await res.json()) as { status: Status; signedUrls?: string[]; error?: string };
    if (data.status === "completed" && data.signedUrls) {
      setImages(data.signedUrls);
      setStatus("completed");
    } else if (data.status === "failed") {
      setError(data.error ?? "Generation failed");
      setStatus("failed");
    }
  }, []);

  const applyRow = useCallback(
    (row: { status: Status; error?: string | null }, id: string) => {
      if (row.status === "completed") {
        void loadSignedUrls(id);
      } else if (row.status === "failed") {
        setError(row.error ?? "Generation failed");
        setStatus("failed");
      } else {
        setStatus(row.status);
      }
    },
    [loadSignedUrls]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || status === "queued" || status === "processing") return;

    setImages([]);
    setError(null);
    setStatus("queued");
    setStartedAt(Date.now());
    setElapsed(0);

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelKey: FLUX_DEV.key, input: { prompt, size } }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Submit failed");
      setStatus("failed");
      return;
    }
    const { generationId } = (await res.json()) as { generationId: string };
    setGenId(generationId);

    // Seed state with a one-shot select BEFORE subscribing (the webhook can finish first).
    const { data: seed } = await supabase.current
      .from("generations")
      .select("status, error")
      .eq("id", generationId)
      .maybeSingle();
    if (seed) applyRow(seed as { status: Status; error?: string | null }, generationId);
  }

  // Subscribe to row UPDATEs for the active generation.
  useEffect(() => {
    if (!genId) return;
    const channel = supabase.current
      .channel(`gen:${genId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "generations", filter: `id=eq.${genId}` },
        (payload) => {
          const row = payload.new as { status: Status; error?: string | null };
          applyRow(row, genId);
        }
      )
      .subscribe();
    return () => {
      void supabase.current.removeChannel(channel);
    };
  }, [genId, applyRow]);

  const running = status === "queued" || status === "processing";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Studio</h1>
        <p className="text-sm text-muted-foreground">Flux Dev — text to image. One tap to Burst.</p>
      </header>

      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image…"
          rows={3}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex items-center gap-3">
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {FLUX_DEV.sizes.map((s) => (
              <option key={s} value={s} className="bg-background">
                {s.replace("*", " × ")}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={running || !prompt.trim()}>
            {running ? "Bursting…" : "Burst"}
          </Button>
        </div>
      </form>

      <section className="min-h-64 rounded-lg border border-border p-4">
        {status === "idle" && (
          <p className="text-sm text-muted-foreground">Your generation will appear here.</p>
        )}
        {running && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            <p className="text-sm capitalize">{status} · {elapsed}s</p>
          </div>
        )}
        {status === "failed" && (
          <p className="py-16 text-center text-sm text-destructive">{error}</p>
        )}
        {status === "completed" && (
          <div className="grid grid-cols-1 gap-4">
            {images.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="generation" className="w-full rounded-md" />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
