"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signIn, sendMagicLink, type AuthState } from "@/lib/supabase/auth-actions";
import GoogleButton from "@/components/auth/GoogleButton";
import PasswordInput from "@/components/auth/PasswordInput";

export default function LoginForm({ next = "/app" }: { next?: string }) {
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, undefined);
  const [linkState, linkAction, linkPending] = useActionState<AuthState, FormData>(
    sendMagicLink,
    undefined,
  );

  return (
    <div className="mt-8 flex flex-col gap-6">
      <GoogleButton next={next} label="Log in with Google" />

      <div className="flex items-center gap-3 text-sm text-mist">
        <span className="h-px flex-1 bg-slate/15" />
        or
        <span className="h-px flex-1 bg-slate/15" />
      </div>

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded-xl border border-slate/20 px-4 py-3 text-base outline-none focus:border-blue"
            placeholder="you@yourbusiness.com"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate">Password</span>
          <PasswordInput
            name="password"
            autoComplete="current-password"
            required
            className="rounded-xl border border-slate/20 px-4 py-3 text-base outline-none focus:border-blue"
            placeholder="Your password"
          />
        </label>

        {state?.error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary btn-lg mt-2 w-full"
        >
          {pending ? "Logging in..." : "Log in"}
        </button>
      </form>

      <div className="border-t border-slate/10 pt-6">
        {!showMagicLink ? (
          <button
            type="button"
            onClick={() => setShowMagicLink(true)}
            className="text-left text-sm text-slate underline decoration-slate/30 underline-offset-4 hover:text-ink"
          >
            Forgot your password? Click here to get a one-time login link.
          </button>
        ) : (
          <form action={linkAction}>
            <p className="text-sm text-slate">Enter your email and we&apos;ll send a one-time login link.</p>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              className="mt-3 w-full rounded-xl border border-slate/20 px-4 py-3 text-base outline-none focus:border-blue"
              placeholder="you@yourbusiness.com"
            />
            {linkState?.error ? (
              <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{linkState.error}</p>
            ) : null}
            <button
              type="submit"
              disabled={linkPending}
              className="mt-3 w-full rounded-xl border border-blue px-8 py-3 font-semibold text-blue transition-colors hover:bg-blue hover:text-white disabled:opacity-60"
            >
              {linkPending ? "Sending..." : "Email me a login link"}
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-sm text-slate">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-blue underline">
          Join the waitlist
        </Link>
      </p>
    </div>
  );
}
