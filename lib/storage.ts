import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "jellyburst-generations";

function extFromContentType(ct: string | null, url: string): string {
  if (ct?.includes("png")) return "png";
  if (ct?.includes("jpeg") || ct?.includes("jpg")) return "jpeg";
  if (ct?.includes("webp")) return "webp";
  if (ct?.includes("mp4")) return "mp4";
  if (ct?.includes("mpeg") || ct?.includes("mp3")) return "mp3";
  if (ct?.includes("gltf-binary") || url.endsWith(".glb")) return "glb";
  const m = url.split("?")[0].match(/\.([a-z0-9]{2,4})$/i);
  return m ? m[1].toLowerCase() : "bin";
}

// Download each ephemeral WaveSpeed output and re-upload to our private bucket at a
// DETERMINISTIC path (so {upsert:true} is genuinely idempotent on a double-fire — the loser
// overwrites the same object instead of orphaning a random-named one). Returns object PATHS.
export async function rehostOutputs(
  userId: string,
  genId: string,
  urls: string[]
): Promise<string[]> {
  const admin = createAdminClient();
  const paths: string[] = [];

  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i]);
    if (!res.ok) throw new Error(`failed to fetch output ${i}: http ${res.status}`);
    const ct = res.headers.get("content-type");
    const ext = extFromContentType(ct, urls[i]);
    const body = Buffer.from(await res.arrayBuffer());
    const path = `${userId}/${genId}/${i}.${ext}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, body, {
      contentType: ct ?? undefined,
      upsert: true,
    });
    if (error) throw new Error(`storage upload failed for ${path}: ${error.message}`);
    paths.push(path);
  }
  return paths;
}

// Mint short-lived signed URLs for stored object paths (serving model: private bucket).
export async function createSignedUrlsForPaths(
  paths: string[],
  ttlSeconds = 3600
): Promise<string[]> {
  if (!paths.length) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrls(paths, ttlSeconds);
  if (error) throw new Error(`createSignedUrls failed: ${error.message}`);
  return (data ?? [])
    .map((d) => d.signedUrl)
    .filter((u): u is string => typeof u === "string" && u.length > 0);
}
