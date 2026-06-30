import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets/images AND the server-to-server callback
    // routes (WaveSpeed webhook + Inngest serve) — those must bypass auth/session middleware.
    "/((?!api/webhooks|api/inngest|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
