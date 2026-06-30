"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp, type AuthState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    signUp,
    null
  );

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
          <p className="text-sm text-muted-foreground">Start bursting on JellyBurst</p>
        </div>
        <form action={formAction} className="space-y-3">
          <Input name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
          <Input name="password" type="password" placeholder="Password" required autoComplete="new-password" minLength={6} />
          {state?.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Sign up"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
