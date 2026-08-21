"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import StatusFilter from "@/components/ui/StatusFilter";

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
  { key: "all", label: "All statuses" },
  { key: "sequencing", label: "Chasing" },
  { key: "replied", label: "Replied" },
  { key: "paused", label: "Paused" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "opted_out", label: "Opted out" },
] as const;

type SortKey = "name" | "amount" | "status" | "nextTouch" | "lastActivity";

const money = formatMoney;
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
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : "");
  const th = "table-head-cell cursor-pointer select-none text-left hover:text-slate";
  const statusTone = (status: string) => STATUS_STYLE[status] ?? "bg-sky text-blue";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          className="rk-input text-sm sm:max-w-xs"
          placeholder="Search name or job"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <StatusFilter value={filter} onChange={(k) => setFilter(k as (typeof FILTERS)[number]["key"])} options={FILTERS} />
      </div>

      <div className="-mx-1 mt-4 flex snap-x gap-3 overflow-x-auto px-1 pb-3 md:hidden">
        {view.length === 0 ? (
          <div className="surface-card w-full border-dashed text-center text-sm text-mist">No matches.</div>
        ) : (
          view.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => router.push(`/inbox?p=${row.id}`)}
              className="surface-card min-w-[82%] snap-start text-left transition-colors hover:border-blue/40 hover:bg-sky/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-ink">{row.name}</p>
                  <p className="mt-1 truncate text-sm text-slate">{row.jobType || "Quote"}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(row.status)}`}>
                  {STATUS_LABEL[row.status] ?? row.status}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="surface-label">Amount</p>
                  <p className="mt-1 font-semibold text-ink">{money(row.amount) || "-"}</p>
                </div>
                <div>
                  <p className="surface-label">Next touch</p>
                  <p className="mt-1 font-semibold text-ink">{touchLabel(row.nextTouch) || "-"}</p>
                </div>
              </div>
              <p className="mt-4 text-xs text-mist">Last activity {activityLabel(row.lastActivity)}</p>
            </button>
          ))
        )}
      </div>

      <div className="table-shell mt-4 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="sticky top-0 bg-[#fbfdff]">
            <tr className="border-b border-sky-line">
              <th className={th} onClick={() => toggleSort("name")}>
                <span className="inline-flex items-center gap-1.5">Name <span>{arrow("name")}</span></span>
              </th>
              <th className={th} onClick={() => toggleSort("status")}>Job</th>
              <th className={`${th} text-right`} onClick={() => toggleSort("amount")}>
                <span className="inline-flex w-full items-center justify-end gap-1.5">Amount <span>{arrow("amount")}</span></span>
              </th>
              <th className={th} onClick={() => toggleSort("status")}>
                <span className="inline-flex items-center gap-1.5">Status <span>{arrow("status")}</span></span>
              </th>
              <th className={th} onClick={() => toggleSort("nextTouch")}>
                <span className="inline-flex items-center gap-1.5">Next touch <span>{arrow("nextTouch")}</span></span>
              </th>
              <th className={th} onClick={() => toggleSort("lastActivity")}>
                <span className="inline-flex items-center gap-1.5">Last activity <span>{arrow("lastActivity")}</span></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {view.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-mist">No matches.</td>
              </tr>
            ) : (
              view.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/inbox?p=${row.id}`)}
                  className="cursor-pointer border-b border-sky-line/60 transition-colors last:border-0 hover:bg-sky/35"
                >
                  <td className="table-body-cell font-semibold text-ink">
                    {row.name}
                  </td>
                  <td className="table-body-cell text-slate">{row.jobType || "-"}</td>
                  <td className="table-body-cell text-right tabular-nums text-slate">{money(row.amount) || "-"}</td>
                  <td className="table-body-cell">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(row.status)}`}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="table-body-cell text-slate">{touchLabel(row.nextTouch) || "-"}</td>
                  <td className="table-body-cell text-mist">{activityLabel(row.lastActivity)}</td>
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
