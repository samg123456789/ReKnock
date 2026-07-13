"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "./Logo";

const links = [
  { href: "/#how", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#integrations", label: "Integrations" },
  { href: "/blog", label: "Guides" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-sky-line bg-white/85 backdrop-blur">
      <nav className="relative flex h-16 w-full items-center justify-between px-5 md:px-8">
        <Link href="/" aria-label="ReKnock home" onClick={() => setOpen(false)}>
          <Logo animated />
        </Link>

        {/* desktop - links dead-center */}
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[15px] font-medium text-slate hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* desktop - auth flush right */}
        <div className="hidden items-center gap-6 md:flex">
          <Link
            href="/login"
            className="text-[15px] font-semibold text-blue hover:text-blue-deep"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-blue px-4 py-2 text-[15px] font-semibold text-white transition-colors hover:bg-blue-deep"
          >
            Start for $1
          </Link>
        </div>

        {/* mobile toggle */}
        <button
          className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 md:hidden"
          aria-expanded={open}
          aria-label="Toggle menu"
          onClick={() => setOpen(!open)}
        >
          <span
            className={`h-0.5 w-6 bg-ink transition-transform ${open ? "translate-y-2 rotate-45" : ""}`}
          />
          <span className={`h-0.5 w-6 bg-ink ${open ? "opacity-0" : ""}`} />
          <span
            className={`h-0.5 w-6 bg-ink transition-transform ${open ? "-translate-y-2 -rotate-45" : ""}`}
          />
        </button>
      </nav>

      {/* mobile menu */}
      {open && (
        <div className="border-t border-sky-line bg-white px-5 pb-6 pt-3 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-lg font-medium text-ink hover:bg-sky"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-3 text-lg font-semibold text-blue hover:bg-sky"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-lg bg-blue px-4 py-3.5 text-center text-lg font-semibold text-white"
            >
              Start for $1 →
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
