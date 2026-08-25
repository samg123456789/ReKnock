"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import NotificationsBell from "@/components/app/NotificationsBell";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/lib/supabase/auth-actions";
import { createBillingPortalSession } from "@/lib/billing-actions";

function initialsFrom(name: string, email: string): string {
  const n = name.trim();
  if (n) {
    const parts = n.split(/\s+/);
    const two = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
    if (two) return two;
  }
  return (email[0] ?? "?").toUpperCase();
}

// Logged-in header: logo home + an avatar chip menu (billing, sign out).
// Fetches the user client-side so the root layout can stay static (keeps the
// marketing site cacheable).
export default function AppHeader() {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<{ email: string; initials: string; isAdmin: boolean } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      if (!u?.email) return;
      const { data: row } = await supabase.from("users").select("platform_admin").eq("auth_user_id", u.id).maybeSingle();
      setMe({
        email: u.email,
        initials: initialsFrom(String(u.user_metadata?.full_name ?? ""), u.email),
        isAdmin: Boolean(row?.platform_admin),
      });
    });
  }, []);

  const initials = me?.initials ?? "";
  const email = me?.email ?? "";
  const inAdmin = pathname.startsWith("/admin");
  const navClass = (href: string) =>
    `rounded-full px-3 py-1.5 transition-colors ${
      pathname === href || (href !== "/app" && pathname.startsWith(href))
        ? "bg-sky text-blue-ink"
        : "text-slate hover:bg-sky/60 hover:text-ink"
    }`;

  return (
    <header className="sticky top-0 z-50 border-b border-sky-line bg-white/90 backdrop-blur-xl">
      <nav className="relative flex h-16 w-full items-center justify-between px-5 md:px-8">
        <Link href="/app" aria-label="ReKnock home">
          <Logo />
        </Link>

        {!inAdmin && me ? (
          <div className="hidden items-center gap-5 text-sm font-medium md:flex">
            <Link href="/app" className={navClass("/app")}>Dashboard</Link>
            <Link href="/inbox" className={navClass("/inbox")}>Inbox</Link>
            <Link href="/campaign" className={navClass("/campaign")}>Message campaigns</Link>
            <Link href="/analytics" className={navClass("/analytics")}>Analytics</Link>
          </div>
        ) : null}

        <div className="flex items-center gap-1.5">
        {!inAdmin && me ? <NotificationsBell /> : null}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-blue text-sm font-bold text-white transition-transform hover:scale-105"
          >
            {initials}
          </button>

          {open ? (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setOpen(false)}
              />
              <div
                role="menu"
                className="overlay-panel absolute right-0 z-50 mt-2 w-56 rounded-xl border border-sky-line bg-white p-1.5 shadow-overlay"
              >
                <p className="truncate px-3 py-2 text-xs text-mist">{email}</p>
                {!inAdmin ? (
                  <div className="mb-1 border-b border-sky-line pb-1 md:hidden">
                    <Link href="/app" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-left text-sm font-medium text-ink hover:bg-sky">Dashboard</Link>
                    <Link href="/inbox" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-left text-sm font-medium text-ink hover:bg-sky">Inbox</Link>
                    <Link href="/campaign" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-left text-sm font-medium text-ink hover:bg-sky">Message campaigns</Link>
                    <Link href="/analytics" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-left text-sm font-medium text-ink hover:bg-sky">Analytics</Link>
                  </div>
                ) : null}
                {me?.isAdmin ? (
                  <Link
                    href={inAdmin ? "/app" : "/admin"}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-2 text-left text-sm font-semibold text-blue hover:bg-sky"
                  >
                    {inAdmin ? "Back to my app" : "Admin dashboard"}
                  </Link>
                ) : null}
                <Link href="/settings" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-sky">
                  Settings
                </Link>
                <form action={createBillingPortalSession}>
                  <button type="submit" className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-sky">
                    Billing
                  </button>
                </form>
                <form action={signOut}>
                  <button type="submit" className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-sky">
                    Sign out
                  </button>
                </form>
              </div>
            </>
          ) : null}
        </div>
        </div>
      </nav>
    </header>
  );
}
