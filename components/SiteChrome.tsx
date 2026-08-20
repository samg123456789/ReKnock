"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import AppHeader from "@/components/app/AppHeader";
import { Logo } from "@/components/Logo";
import { signOut } from "@/lib/supabase/auth-actions";

// Marketing routes get the marketing nav + footer; logged-in app routes get the
// app header and no footer. Onboarding gets a focused header (logo + sign out,
// no nav) so nothing pulls the contractor out of setup before it is done.
const APP_PREFIXES = ["/app", "/checkout", "/settings", "/inbox", "/campaign", "/admin", "/suspended"];

function OnboardingHeader() {
  return (
    <header className="border-b border-sky-line bg-white">
      <div className="flex h-16 items-center justify-between px-5 md:px-8">
        <Link href="/" aria-label="ReKnock">
          <Logo />
        </Link>
        <form action={signOut}>
          <button type="submit" className="cursor-pointer text-sm font-medium text-mist hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const isOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  const isApp = APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (isOnboarding) {
    return (
      <>
        <OnboardingHeader />
        {children}
      </>
    );
  }

  if (isApp) {
    return (
      <>
        <AppHeader />
        {children}
      </>
    );
  }

  return (
    <>
      <Nav />
      {children}
      <Footer />
    </>
  );
}
