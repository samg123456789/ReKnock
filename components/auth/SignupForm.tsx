"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUp, type AuthState } from "@/lib/supabase/auth-actions";
import {
  checkPassword,
  passwordStrength,
  passwordValid,
  PASSWORD_RULES,
} from "@/lib/password";
import GoogleButton from "@/components/auth/GoogleButton";

const STRENGTH_COLOR: Record<string, string> = {
  Weak: "#ef4444",
  Okay: "#f59e0b",
  Strong: "#16a34a",
};

export default function SignupForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, undefined);
  const [password, setPassword] = useState("");

  const checks = checkPassword(password);
  const strength = passwordStrength(password);
  const valid = passwordValid(password);

  return (
    <div className="mt-8 flex flex-col gap-6">
      <GoogleButton next="/app" label="Sign up with Google" />

      <div className="flex items-center gap-3 text-sm text-mist">
        <span className="h-px flex-1 bg-slate/15" />
        or
        <span className="h-px flex-1 bg-slate/15" />
      </div>

      <form action={action} className="flex flex-col gap-4">
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-slate/20 px-4 py-3 text-base outline-none focus:border-blue"
            placeholder="Create a password"
          />
        </label>

        {/* Strength meter */}
        <div aria-live="polite">
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="h-1.5 flex-1 rounded-full"
                style={{
                  background: i < strength.score ? STRENGTH_COLOR[strength.label] : "#e2e8f0",
                }}
              />
            ))}
          </div>
          {password ? (
            <p className="mt-1 text-xs font-semibold" style={{ color: STRENGTH_COLOR[strength.label] }}>
              {strength.label}
            </p>
          ) : null}
        </div>

        {/* Requirements checklist */}
        <ul className="flex flex-col gap-1 text-sm">
          {PASSWORD_RULES.map((rule) => {
            const met = checks[rule.key];
            return (
              <li
                key={rule.key}
                className="flex items-center gap-2"
                style={{ color: met ? "#16a34a" : "#64748b" }}
              >
                <span aria-hidden="true">{met ? "✓" : "○"}</span>
                {rule.label}
              </li>
            );
          })}
        </ul>

        {state?.error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending || !valid}
          className="mt-2 rounded-xl bg-blue px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-60"
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
    </div>
  );
}
