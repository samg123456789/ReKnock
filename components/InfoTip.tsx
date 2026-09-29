import type { ReactNode } from "react";

export default function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate/30 text-[10px] font-bold text-mist hover:border-blue hover:text-blue"
      >
        i
      </button>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-56 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-overlay group-hover:block group-focus-within:block">
        {children}
      </span>
    </span>
  );
}
