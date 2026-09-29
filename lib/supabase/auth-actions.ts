"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { DEV_PREVIEW_ORIGIN, siteOrigin } from "@/lib/site-url";
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

async function createPreviewAccount({
  email,
  password,
  fullName,
  origin,
}: {
  email: string;
  password: string;
  fullName: string;
  origin: string;
}): Promise<string | null> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!serviceRoleKey || !resendKey) {
    return "Preview signup is not configured yet. Please contact the ReKnock team.";
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      data: { full_name: fullName, reknock_test_account: true },
      redirectTo: `${origin}/auth/confirm?next=/app`,
    },
  });

  if (error || !data.properties?.hashed_token || !data.properties?.verification_type) {
    return readableAuthError(error, "We could not create your account. Please try again.");
  }

  // Do not send Supabase's action_link here. It is an Auth-server URL and can
  // fall back to the Supabase project's Site URL (production) when its
  // redirect configuration is missing or rejected. We own the callback, so
  // send the one-time token directly to the dev app instead.
  const confirmationUrlObject = new URL(`${DEV_PREVIEW_ORIGIN}/auth/confirm`);
  confirmationUrlObject.searchParams.set("token_hash", data.properties.hashed_token);
  confirmationUrlObject.searchParams.set("type", data.properties.verification_type);
  confirmationUrlObject.searchParams.set("next", "/app");
  const confirmationUrl = confirmationUrlObject.toString();
  if (new URL(confirmationUrl).origin !== DEV_PREVIEW_ORIGIN) {
    if (data.user?.id) await admin.auth.admin.deleteUser(data.user.id);
    return "Preview signup was routed to the wrong environment. Please try again.";
  }
  const html = `
    <div style="margin:0;background:#f4f8fc;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;color:#10203a">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbe5f0;border-radius:20px;padding:40px 36px">
        <div style="font-size:15px;letter-spacing:3px;font-weight:700;color:#2563eb">REKNOCK</div>
        <h1 style="margin:28px 0 14px;font-size:32px;line-height:1.15;color:#10203a">Let’s get your quotes moving.</h1>
        <p style="margin:0 0 26px;font-size:16px;line-height:1.6;color:#52627a">Confirm your email to finish setting up your ReKnock account and start your setup.</p>
        <p style="margin:0 0 28px"><a href="${confirmationUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:10px;padding:15px 22px;font-size:16px;font-weight:700">Confirm email address</a></p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#7a8799">If you didn’t create a ReKnock account, you can ignore this email.</p>
        <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5edf5;font-size:13px;line-height:1.6;color:#7a8799">ReKnock helps contractors turn quiet quotes into conversations.</div>
      </div>
    </div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: "Sam from ReKnock <hello@getreknock.com>",
      to: [email],
      subject: "Welcome to ReKnock. Confirm your email",
      html,
    }),
  });

  if (!response.ok) {
    if (data.user?.id) await admin.auth.admin.deleteUser(data.user.id);
    return "Your account could not be created because the confirmation email could not be sent. Please try again.";
  }

  return null;
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
  if (testAccount) {
    const previewError = await createPreviewAccount({ email, password, fullName, origin });
    if (previewError) return { error: previewError };
    redirect(`/signup/check-email?email=${encodeURIComponent(email)}`);
  }

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
