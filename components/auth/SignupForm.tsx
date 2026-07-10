"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthState } from "@/lib/supabase/auth-actions";

export default function SignupForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, undefined);

  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate">Your name</span>
        <input
          name="full_name"
          type="text"
          autoComplete="name"
          required
          className="rounded-xl border border-slate/20 px-4 py-3 text-base outline-none focus:border-blue"
          placeholder="Mike Reyes"
        />
      </label>
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
          autoComplete="new-password"
          required
          minLength={8}
          className="rounded-xl border border-slate/20 px-4 py-3 text-base outline-none focus:border-blue"
          placeholder="At least 8 characters"
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
        {pending ? "Creating your account..." : "Create account"}
      </button>

      <p className="mt-2 text-center text-sm text-slate">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-blue underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
