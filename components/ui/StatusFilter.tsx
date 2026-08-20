"use client";

// Shared status filter for the dashboard table and the inbox list. A dropdown
// instead of a pill row: the status set grows (Paused, Opted out, ...) and a
// row of eight pills stops reading as a control.
export type StatusFilterOption = { key: string; label: string };

export default function StatusFilter({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string;
  onChange: (key: string) => void;
  options: readonly StatusFilterOption[];
  className?: string;
}) {
  return (
    <select
      aria-label="Filter by status"
      className={`cursor-pointer rounded-xl border border-slate/20 bg-white px-3 py-2 text-sm font-semibold text-slate outline-none focus:border-blue ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
    </select>
  );
}
