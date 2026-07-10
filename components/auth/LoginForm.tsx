"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, sendMagicLink, type AuthState } from "@/lib/supabase/auth-actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, undefined);
  const [linkState, linkAction, linkPending] = useActionState<AuthState, FormData>(
    sendMagicLink,
    undefined,
  );

  return (
    <div className="mt-8 flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
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
          <input
            name="password"
            type="password"
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
          className="mt-2 rounded-xl bg-blue px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-blue-deep disabled:opacity-60"
        >
          {pending ? "Logging in..." : "Log in"}
        </button>
      </form>

      <form action={linkAction} className="border-t border-slate/10 pt-6">
        <p className="text-sm text-slate">Forgot your password? Get a one-time login link by email.</p>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
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

      <p className="text-center text-sm text-slate">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-blue underline">
          Start for $1
        </Link>
      </p>
    </div>
  );
}
