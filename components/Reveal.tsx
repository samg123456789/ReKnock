"use client";

import { useEffect, useRef } from "react";

/* Progressive-enhancement scroll reveal.
   The content is ALWAYS in the server-rendered HTML and, by default, fully
   visible - so crawlers and no-JS visitors see everything. Only when JS is
   present AND the visitor hasn't asked for reduced motion do we arm the hidden
   state (via the data-reveal attribute) and then reveal on scroll. Because we
   only arm after mount, and only apply this to below-the-fold sections, there
   is no flash: the hide happens off-screen and the reveal plays on entry.
   If JS never runs, nothing is armed and the content simply stays visible. */

type Props = {
  children: React.ReactNode;
  className?: string;
  /** ms of transition-delay, for staggering siblings */
  delay?: number;
};

export default function Reveal({ children, className = "", delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return; // stay visible

    el.setAttribute("data-reveal", "hidden");

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.setAttribute("data-reveal", "shown");
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
