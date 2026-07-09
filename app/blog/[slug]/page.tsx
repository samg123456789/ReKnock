import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { posts, getPost } from "@/lib/posts";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} - ReKnock`,
    description: post.description,
    alternates: { canonical: `https://getreknock.com/blog/${post.slug}` },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Organization", name: "ReKnock" },
    publisher: { "@type": "Organization", name: "ReKnock", url: "https://getreknock.com" },
  };

  return (
    <main className="mx-auto max-w-2xl px-5 py-16 md:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link href="/blog" className="font-mono text-sm text-mist hover:text-blue">
        ← All posts
      </Link>
      <p className="mt-6 font-mono text-xs text-mist">
        {post.date} · {post.readMinutes} min read
      </p>
      <h1 className="display mt-2 text-4xl md:text-5xl">{post.title}</h1>
      <div className="mt-8 space-y-5">
        {post.blocks.map((b, i) => {
          if (b.type === "h2")
            return (
              <h2 key={i} className="display pt-4 text-3xl text-blue-ink">
                {b.text}
              </h2>
            );
          if (b.type === "quote")
            return (
              <blockquote
                key={i}
                className="rounded-xl border-l-4 border-blue bg-sky p-5 text-lg leading-relaxed text-ink"
              >
                {b.text}
              </blockquote>
            );
          if (b.type === "list")
            return (
              <ul key={i} className="space-y-3 pl-1">
                {b.items.map((it) => (
                  <li key={it} className="flex gap-2.5 leading-relaxed text-slate">
                    <span aria-hidden className="mt-1 font-bold text-blue">–</span>
                    {it}
                  </li>
                ))}
              </ul>
            );
          return (
            <p key={i} className="text-lg leading-relaxed text-slate">
              {b.text}
            </p>
          );
        })}
      </div>
      <div className="card mt-12 p-7 text-center">
        <h3 className="display text-3xl">Want this to run itself?</h3>
        <p className="mx-auto mt-2 max-w-md text-slate">
          ReKnock sends these follow-ups automatically, in your voice, and
          stops the second the homeowner replies.
        </p>
        <Link
          href="/signup"
          className="mt-5 inline-block rounded-xl bg-blue px-8 py-3.5 font-semibold text-white hover:bg-blue-deep"
        >
          Start for $1 →
        </Link>
      </div>
    </main>
  );
}
