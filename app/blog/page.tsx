import Link from "next/link";
import type { Metadata } from "next";
import { posts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Blog - ReKnock | Follow-up playbooks for the trades",
  description:
    "Follow-up timing, free text templates, and close-rate tactics for roofers, painters, and every quoted trade.",
  alternates: { canonical: "https://getreknock.com/blog" },
};

export default function Blog() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 md:py-24">
      <p className="eyebrow mb-4">The ReKnock blog</p>
      <h1 className="display text-5xl md:text-6xl">
        Follow-up playbooks for the trades.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-slate">
        Short, practical answers to the questions contractors actually ask -
        no fluff, free templates included.
      </p>
      <div className="mt-12 space-y-5">
        {posts.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="card card-hover block p-6">
            <p className="font-mono text-xs text-mist">
              {p.date} · {p.readMinutes} min read
            </p>
            <h2 className="display mt-2 text-3xl text-blue-ink">{p.title}</h2>
            <p className="mt-2 leading-relaxed text-slate">{p.description}</p>
            <p className="mt-3 font-semibold text-blue">Read it →</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
