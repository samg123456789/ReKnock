"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type ProspectRow = {
  id: string;
  name: string;
  jobType: string;
  amount: number | null;
  status: string;
  nextTouch: string | null; // YYYY-MM-DD
  lastActivity: string; // ISO
};

const STATUS_LABEL: Record<string, string> = {
  new: "New", sequencing: "Chasing", replied: "Replied", won: "Won", lost: "Lost", opted_out: "Opted out", paused: "Paused",
};
const STATUS_STYLE: Record<string, string> = {
  sequencing: "bg-sky text-blue",
  replied: "bg-blue text-white",
  won: "bg-mint/15 text-mint",
  lost: "bg-slate/10 text-slate",
  opted_out: "bg-slate/10 text-slate",
  paused: "bg-amber/15 text-amber",
  new: "bg-sky text-blue",
};
const FILTERS = [
  { key: "all", label: "All" },
  { key: "sequencing", label: "Chasing" },
  { key: "replied", label: "Replied" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
] as const;

type SortKey = "name" | "amount" | "status" | "nextTouch" | "lastActivity";

function money(n: number | null): string {
  if (n == null) return "";
  return "$" + n.toLocaleString("en-US");
}
function touchLabel(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function activityLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const day = Math.floor(diff / 86400000);
  if (day < 1) return "Today";
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function DashboardTable({ rows }: { rows: ProspectRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "lastActivity", dir: -1 });

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    let r = rows.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!q) return true;
      return row.name.toLowerCase().includes(q) || row.jobType.toLowerCase().includes(q);
    });
    const { key, dir } = sort;
    r = [...r].sort((a, b) => {
      let av: string | number, bv: string | number;
      if (key === "amount") { av = a.amount ?? -1; bv = b.amount ?? -1; }
      else if (key === "nextTouch") { av = a.nextTouch ?? "9999"; bv = b.nextTouch ?? "9999"; }
      else if (key === "lastActivity") { av = a.lastActivity; bv = b.lastActivity; }
      else if (key === "status") { av = STATUS_LABEL[a.status] ?? a.status; bv = STATUS_LABEL[b.status] ?? b.status; }
      else { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return r;
  }, [rows, query, filter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));
  }
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : "");
  const th = "cursor-pointer select-none px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-mist hover:text-slate";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          className="w-full rounded-xl border border-slate/20 px-4 py-2.5 text-sm outline-none focus:border-blue sm:max-w-xs"
          placeholder="Search name or job"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors ${filter === f.key ? "bg-blue text-white" : "bg-sky text-blue hover:bg-sky-line"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-sky-line">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-sky-line">
              <th className={th} onClick={() => toggleSort("name")}>Name{arrow("name")}</th>
              <th className={`${th} hidden md:table-cell`} onClick={() => toggleSort("status")}>Job</th>
              <th className={`${th} hidden text-right md:table-cell`} onClick={() => toggleSort("amount")}>Amount{arrow("amount")}</th>
              <th className={th} onClick={() => toggleSort("status")}>Status{arrow("status")}</th>
              <th className={th} onClick={() => toggleSort("nextTouch")}>Next touch{arrow("nextTouch")}</th>
              <th className={`${th} hidden md:table-cell`} onClick={() => toggleSort("lastActivity")}>Last activity{arrow("lastActivity")}</th>
            </tr>
          </thead>
          <tbody>
            {view.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-mist">No matches.</td>
              </tr>
            ) : (
              view.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/inbox?p=${row.id}`)}
                  className="cursor-pointer border-b border-sky-line/60 transition-colors last:border-0 hover:bg-sky/40"
                >
                  <td className="px-3 py-3 font-semibold text-ink">
                    {row.name}
                    <span className="block text-xs font-normal text-mist md:hidden">{row.jobType}</span>
                  </td>
                  <td className="hidden px-3 py-3 text-slate md:table-cell">{row.jobType || "—"}</td>
                  <td className="hidden px-3 py-3 text-right tabular-nums text-slate md:table-cell">{money(row.amount) || "—"}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[row.status] ?? "bg-sky text-blue"}`}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate">{touchLabel(row.nextTouch) || "—"}</td>
                  <td className="hidden px-3 py-3 text-mist md:table-cell">{activityLabel(row.lastActivity)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-mist">{view.length} of {rows.length} {rows.length === 1 ? "quote" : "quotes"}</p>
    </div>
  );
}
