"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { passwordValid, PASSWORD_REQUIREMENTS_MESSAGE } from "@/lib/password";

export type AuthState = { error?: string } | undefined;

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!fullName) return { error: "Please tell us your name." };
  if (!email) return { error: "Please enter your email." };
  if (!passwordValid(password)) return { error: PASSWORD_REQUIREMENTS_MESSAGE };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${env.appUrl()}/auth/confirm?next=/app`,
    },
  });

  if (error) return { error: error.message };
  redirect("/signup/check-email");
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: "That email or password did not work. Try again." };
  redirect("/app");
}

export async function sendMagicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email first." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${env.appUrl()}/auth/confirm?next=/app` },
  });

  if (error) return { error: error.message };
  redirect("/login/check-email");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
