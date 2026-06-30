import { NextResponse } from "next/server";

import { createSignedUrlsForPaths } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Mint short-lived signed URLs for a generation's outputs — only for the owner (IDOR guard via RLS).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // User-scoped client: RLS guarantees the caller can only read their own row.
  const { data: row } = await supabase
    .from("generations")
    .select("status, output_urls, error")
    .eq("id", id)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (row.status === "completed" && Array.isArray(row.output_urls) && row.output_urls.length) {
    const signedUrls = await createSignedUrlsForPaths(row.output_urls as string[]);
    return NextResponse.json({ status: row.status, signedUrls });
  }

  return NextResponse.json({ status: row.status, error: row.error ?? null });
}
