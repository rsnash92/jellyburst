import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY service-role client (BYPASSRLS). NEVER import this from a client component
// or any NEXT_PUBLIC path. Used by the webhook + reconciler to re-host outputs and write
// terminal state on rows they don't "own" via the user session.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (server-only)");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
