import type { Metadata } from "next";
import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Log in - ReKnock" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/app" } = await searchParams;
  const allowSignup = process.env.VERCEL_ENV !== "production";

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">Log in</p>
      <h1 className="display text-4xl md:text-5xl">Welcome back.</h1>
      <LoginForm next={next} allowSignup={allowSignup} />
    </main>
  );
}
