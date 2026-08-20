"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type CustomerRow = {
  id: string;
  company: string;
  email: string;
  trade: string;
  plan: string;
  subStatus: string;
  trialUsed: number;
  onboarded: boolean;
  prospects: number;
  sent: number;
  lastActivity: string;
  createdAt: string;
};

type SortKey = "company" | "subStatus" | "trialUsed" | "prospects" | "sent" | "lastActivity" | "createdAt";

const COLS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: "company", label: "Company" },
  { key: "subStatus", label: "Status" },
  { key: "trialUsed", label: "Trial", num: true },
  { key: "prospects", label: "Quotes", num: true },
  { key: "sent", label: "Sent", num: true },
  { key: "lastActivity", label: "Last activity" },
  { key: "createdAt", label: "Joined" },
];

function fmt(iso: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

export default function AdminCustomersTable({ rows }: { rows: CustomerRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.company.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.trade.toLowerCase().includes(q))
      : rows;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, query, sortKey, dir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setDir("desc");
    }
  }

  return (
    <div className="mt-4">
      <input
        className="w-full max-w-sm rounded-xl border border-slate/20 px-4 py-2.5 text-base outline-none focus:border-blue"
        placeholder="Search company, email, trade"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-4 overflow-x-auto rounded-xl border border-sky-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sky-line bg-sky/40 text-left">
              {COLS.map((c) => (
                <th key={c.key} className="px-3 py-2.5">
                  <button type="button" className="cursor-pointer font-semibold text-slate hover:text-ink" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    {sortKey === c.key ? (dir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.id} className="border-b border-sky-line last:border-0 hover:bg-sky/30">
                <td className="px-3 py-2.5">
                  <Link href={`/admin/companies/${r.id}`} className="cursor-pointer font-semibold text-blue hover:underline">
                    {r.company}
                  </Link>
                  <div className="text-xs text-mist">{r.email}{r.trade ? ` · ${r.trade}` : ""}</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded-full bg-sky px-2 py-0.5 text-xs font-semibold text-blue">{r.subStatus}</span>
                  {!r.onboarded ? <span className="ml-1 text-xs text-mist">setup</span> : null}
                </td>
                <td className="px-3 py-2.5 tabular-nums">{r.trialUsed}</td>
                <td className="px-3 py-2.5 tabular-nums">{r.prospects}</td>
                <td className="px-3 py-2.5 tabular-nums">{r.sent}</td>
                <td className="px-3 py-2.5 text-slate">{fmt(r.lastActivity)}</td>
                <td className="px-3 py-2.5 text-slate">{fmt(r.createdAt)}</td>
              </tr>
            ))}
            {view.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} className="px-3 py-8 text-center text-mist">No customers match.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
