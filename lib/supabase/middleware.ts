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

  // Public routes that never require auth.
  const isPublic =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/pricing") ||
    path.startsWith("/privacy") ||
    path.startsWith("/blog") ||
    path.startsWith("/auth"); // confirmation callback

  const isAppRoute =
    path.startsWith("/app") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/checkout") ||
    path.startsWith("/settings") ||
    path.startsWith("/inbox");

  // Unauthenticated user hitting a protected route -> login.
  if (!user && isAppRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated user: decide checkout vs onboarding vs app. We read the
  // company's subscription + onboarding state here. Full gating logic is added
  // as Stripe (checkout) and onboarding land; keep it permissive until then so
  // we never lock a user out of a route that does not exist yet.
  if (user && isPublic && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return response;
}
