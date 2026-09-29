"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/site-url";
import { passwordValid, PASSWORD_REQUIREMENTS_MESSAGE } from "@/lib/password";

export type AuthState = { error?: string } | undefined;

function readableAuthError(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const testAccount = formData.get("test_account") === "1" && process.env.VERCEL_ENV !== "production";

  if (!fullName) return { error: "Please tell us your name." };
  if (!email) return { error: "Please enter your email." };
  if (!passwordValid(password)) return { error: PASSWORD_REQUIREMENTS_MESSAGE };

  const origin = await siteOrigin();
  const supabase = await createClient();
  try {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, ...(testAccount ? { reknock_test_account: true } : {}) },
        emailRedirectTo: `${origin}/auth/confirm?next=/app`,
      },
    });

    if (error) return { error: readableAuthError(error, "We could not create your account. Please try again.") };
  } catch (error) {
    return { error: readableAuthError(error, "We could not create your account. Please try again.") };
  }
  redirect(`/signup/check-email?email=${encodeURIComponent(email)}`);
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: "That email or password did not work. Try again." };
  const next = String(formData.get("next") ?? "/app");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/app");
}

export async function sendMagicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email first." };

  const origin = await siteOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/app` },
  });

  if (error) return { error: error.message };
  redirect(`/login/check-email?email=${encodeURIComponent(email)}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
