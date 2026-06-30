import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client. Reads ONLY the two NEXT_PUBLIC vars (safe in the bundle).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
