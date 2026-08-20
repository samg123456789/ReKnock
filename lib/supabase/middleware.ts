import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

// Refreshes the Supabase session on every request and enforces the paywall
// routing gate (CLAUDE.md Phase 1):
//   unauthenticated        -> marketing site (public routes only)
//   authed + unpaid        -> /checkout
//   authed + paid + !onboarded -> /onboarding
//   otherwise              -> app
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const redirectTo = (p: string) => {
    const url = request.nextUrl.clone();
    url.pathname = p;
    url.search = "";
    return NextResponse.redirect(url);
  };

  // Routes that need a paid + onboarded account.
  const needsPaid =
    path.startsWith("/app") || path.startsWith("/settings") || path.startsWith("/inbox");
  // Routes that only need auth (the funnel itself).
  const needsAuth = needsPaid || path.startsWith("/onboarding") || path.startsWith("/checkout");

  // Unauthenticated user hitting a protected route -> login.
  if (!user && needsAuth) return redirectTo("/login");

  if (user) {
    // Logged-in user should not sit on the auth pages.
    if (path === "/login" || path === "/signup") return redirectTo("/app");

    if (needsAuth) {
      // Read the company's billing + onboarding state (RLS scopes this to the
      // caller's own company).
      const { data: company } = await supabase
        .from("companies")
        .select("subscription_status, onboarded_at, suspended_at")
        .maybeSingle();

      // Suspended by an admin: pause access (except the suspended notice).
      if (company?.suspended_at && !path.startsWith("/suspended")) return redirectTo("/suspended");

      const paid =
        company?.subscription_status === "trialing" ||
        company?.subscription_status === "active" ||
        company?.subscription_status === "past_due";
      const onboarded = Boolean(company?.onboarded_at);

      // Unpaid -> checkout (except when already there).
      if (!paid && !path.startsWith("/checkout")) return redirectTo("/checkout");
      // Paid but not onboarded -> onboarding (except when already there).
      if (paid && !onboarded && !path.startsWith("/onboarding")) return redirectTo("/onboarding");
      // Paid + onboarded should not sit on checkout/onboarding.
      if (paid && onboarded && (path.startsWith("/checkout") || path.startsWith("/onboarding")))
        return redirectTo("/app");
    }
  }

  return response;
}
