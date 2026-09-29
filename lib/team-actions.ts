"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type TeamResult = { ok: true; inviteUrl?: string } | { ok: false; error: string };

async function actingWithRole() {
  const a = await getActingCompany();
  if (!a?.companyId) redirect("/login");
  const { data: me } = await a.client.from("users").select("id, role").eq("id", a.actorUserId).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) throw new Error("Only an owner or admin can manage team members.");
  return { a, me };
}

export async function inviteTeamMember(email: string, role: "admin" | "member"): Promise<TeamResult> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: "Enter a valid email address." };
  if (!['admin', 'member'].includes(role)) return { ok: false, error: "Pick a valid role." };
  const { a, me } = await actingWithRole();
  const { data: existing } = await a.client.from("users").select("id").eq("company_id", a.companyId!).ilike("email", clean).maybeSingle();
  if (existing) return { ok: false, error: "That person is already on this team." };
  const { data: pending } = await a.client.from("company_invitations").select("id").eq("company_id", a.companyId!).ilike("email", clean).is("accepted_at", null).maybeSingle();
  if (pending) return { ok: false, error: "An invite is already pending for that email." };

  const token = crypto.randomBytes(24).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const { error } = await a.client.from("company_invitations").insert({
    company_id: a.companyId,
    email: clean,
    role,
    token_hash: tokenHash,
    invited_by: me.id,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) return { ok: false, error: "Could not create the invite. Try again." };

  const appUrl = process.env.APP_URL ?? "";
  const key = process.env.RESEND_API_KEY;
  if (appUrl && key) {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: "ReKnock <notifications@getreknock.com>",
        to: [clean],
        subject: "You were invited to a ReKnock workspace",
        text: `You were invited to join a ReKnock workspace as an ${role}.\n\nAccept the invite: ${appUrl}/invite?token=${token}\n\nThis invite expires in 7 days.`,
      }),
    });
    if (!resp.ok) return { ok: false, error: "The invite was created, but the email could not be sent. Try sending it again later." };
  }
  return { ok: true, inviteUrl: `${appUrl}/invite?token=${token}` };
}

export async function acceptTeamInvite(token: string): Promise<TeamResult> {
  const cleanToken = token.trim();
  if (!cleanToken) return { ok: false, error: "That invite link is missing its token." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Log in with the invited email first." };
  const hash = crypto.createHash("sha256").update(cleanToken).digest("hex");
  const admin = createAdminClient();
  const { data: invite } = await admin.from("company_invitations").select("id, company_id, email, role, expires_at, accepted_at").eq("token_hash", hash).maybeSingle();
  if (!invite || invite.accepted_at || new Date(invite.expires_at) < new Date()) return { ok: false, error: "That invite has expired or was already used." };
  if (user.email.toLowerCase() !== String(invite.email).toLowerCase()) return { ok: false, error: `Log in with ${invite.email} to accept this invite.` };
  const { data: currentMember } = await admin.from("users").select("company_id").eq("auth_user_id", user.id).maybeSingle();
  if (currentMember?.company_id && currentMember.company_id !== invite.company_id) return { ok: false, error: "This account already belongs to another workspace." };

  const { error: userError } = await admin.from("users").update({ company_id: invite.company_id, role: invite.role, email: user.email.toLowerCase() }).eq("auth_user_id", user.id);
  if (userError) return { ok: false, error: "Could not add you to that workspace." };
  await admin.from("company_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
  await admin.from("events").insert({ company_id: invite.company_id, type: "team_invite_accepted", payload: { email: user.email, role: invite.role } });
  return { ok: true };
}

export async function updateNotificationPreferences(preferences: Record<string, boolean>): Promise<TeamResult> {
  const a = await getActingCompany();
  if (!a?.actorUserId) redirect("/login");
  const allowed = { replies: Boolean(preferences.replies), delivery: Boolean(preferences.delivery), usage: Boolean(preferences.usage), weekly: Boolean(preferences.weekly) };
  const { error } = await a.client.from("users").update({ notification_preferences: allowed }).eq("id", a.actorUserId);
  return error ? { ok: false, error: "Could not save notification preferences." } : { ok: true };
}
