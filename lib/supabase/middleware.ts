import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Refreshes the Supabase session on every request and keeps auth cookies in sync.
// CRITICAL: do NOT add logic between createServerClient and getUser() — a documented
// @supabase/ssr gotcha that otherwise causes random session logouts.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Defensive: if config is missing (e.g. a build that predates the env vars),
  // never take the whole site down — just skip the session refresh.
  if (!url || !key) {
    return supabaseResponse;
  }

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    // Re-validates the token against Supabase (never getSession()).
    await supabase.auth.getUser();
  } catch {
    // A transient Supabase/network error must not 500 every route.
    return supabaseResponse;
  }

  return supabaseResponse;
}
