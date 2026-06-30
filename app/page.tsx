import Link from "next/link";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  // Auth decision uses getUser() (re-validates the token) — never getSession().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="flex flex-col items-center gap-6">
        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
          AI Generation Studio
        </span>
        <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-6xl font-semibold tracking-tight text-transparent sm:text-7xl">
          JellyBurst
        </h1>
        <p className="max-w-md text-lg leading-8 text-muted-foreground">
          Generate AI images, video, audio and 3D from one fast, asset-first
          studio. One tap to Burst.
        </p>

        {user ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Signed in as{" "}
              <span className="text-foreground">{user.email}</span>
            </p>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="outline">
                Sign out
              </Button>
            </form>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/signup">Sign up</Link>
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
