"use client";

import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import AppHeader from "@/components/app/AppHeader";

// Marketing routes get the marketing nav + footer; logged-in app routes get the
// app header and no footer. Keeps the two experiences from bleeding together.
const APP_PREFIXES = ["/app", "/onboarding", "/checkout", "/settings", "/inbox", "/admin", "/suspended"];

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const isApp = APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

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
