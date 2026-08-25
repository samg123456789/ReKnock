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
import PasswordInput from "@/components/auth/PasswordInput";

const STRENGTH_COLOR: Record<string, string> = {
  Weak: "#ef4444",
  Okay: "#f59e0b",
  Strong: "#16a34a",
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const inputClass =
  "rounded-xl border border-slate/20 px-4 py-3 text-base outline-none focus:border-blue";

export default function SignupForm({ testMode = false }: { testMode?: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, undefined);
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  const checks = checkPassword(password);
  const strength = passwordStrength(password);
  const passwordOk = passwordValid(password);

  function continueToDetails() {
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError("Enter a valid email.");
      return;
    }
    setEmailError(null);
    setStep(2);
  }

  // Step 1: Google first (primary), then the email-first flow below the divider.
  if (step === 1) {
    return (
      <div className="mt-8 flex flex-col gap-6">
        <GoogleButton next="/app" label="Sign up with Google" />

        <div className="flex items-center gap-3 text-sm text-mist">
          <span className="h-px flex-1 bg-slate/15" />
          or
          <span className="h-px flex-1 bg-slate/15" />
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  continueToDetails();
                }
              }}
              className={inputClass}
              placeholder="you@yourbusiness.com"
            />
          </label>
          {emailError ? (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{emailError}</p>
          ) : null}
          <button
            type="button"
            onClick={continueToDetails}
            className="btn btn-primary btn-lg"
          >
            Continue with email
          </button>
        </div>

        <p className="text-center text-sm text-slate">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-blue underline">
            Log in
          </Link>
        </p>
      </div>
    );
  }

  // Step 2: name + password (with rules + strength meter).
  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate">
          Creating account for <span className="font-semibold">{email}</span>
        </span>
        <button
          type="button"
          onClick={() => setStep(1)}
          className="font-semibold text-blue underline"
        >
          Change
        </button>
      </div>

      {/* Email carried from step 1 so the server action gets all fields. */}
      <input type="hidden" name="email" value={email} />
      {testMode ? <input type="hidden" name="test_account" value="1" /> : null}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate">Your name</span>
        <input
          name="full_name"
          type="text"
          autoComplete="name"
          autoFocus
          required
          className={inputClass}
          placeholder="Mike Reyes"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate">Password</span>
        <PasswordInput
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
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
              style={{ background: i < strength.score ? STRENGTH_COLOR[strength.label] : "#e2e8f0" }}
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
        disabled={pending || !passwordOk}
        className="btn btn-primary btn-lg mt-2 w-full"
      >
        {pending ? "Creating your account..." : "Create account"}
      </button>
    </form>
  );
}
