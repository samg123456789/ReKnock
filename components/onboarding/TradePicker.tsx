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
    <div className="rounded-xl border border-slate/20 p-2 focus-within:border-blue">
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-sky px-3 py-1 text-sm font-semibold text-blue">
              {tradeLabel(v)}
              <button type="button" aria-label={`Remove ${tradeLabel(v)}`} className="cursor-pointer text-blue/70 hover:text-blue" onClick={() => toggle(v)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="w-full px-2 py-1.5 text-base outline-none"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={value.length ? "Add another trade" : "Search your trade (roofing, HVAC, GC...)"}
      />
      {query.trim() && matches.length > 0 && (
        <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-sky-line">
          {matches.map((t) => (
            <button
              key={t.value}
              type="button"
              className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-sky"
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
