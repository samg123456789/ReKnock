"use client";

import { useMemo, useState } from "react";
import { TRADES, tradeLabel } from "@/lib/trades";

// Searchable multi-select. No external dependency (shadcn is not installed).
export default function TradePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TRADES.filter(
      (t) => !value.includes(t.value) && (!q || t.label.toLowerCase().includes(q)),
    );
  }, [query, value]);

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  return (
    <div className="rounded-2xl border border-slate/20 bg-white p-2 transition-colors focus-within:border-blue">
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-sky px-3 py-1 text-sm font-semibold text-blue-ink">
              {tradeLabel(v)}
              <button type="button" aria-label={`Remove ${tradeLabel(v)}`} className="cursor-pointer text-blue/70 hover:text-blue" onClick={() => toggle(v)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="w-full rounded-xl px-2 py-2 text-base outline-none"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={value.length ? "Add another trade" : "Search your trade (roofing, HVAC, GC...)"}
      />
      {query.trim() && matches.length > 0 && (
        <div className="overlay-panel mt-2 max-h-56 overflow-y-auto rounded-xl border border-sky-line bg-white p-1">
          {matches.map((t) => (
            <button
              key={t.value}
              type="button"
              className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-sky"
              onClick={() => {
                toggle(t.value);
                setQuery("");
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
