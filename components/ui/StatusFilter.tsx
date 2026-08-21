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
    <span className={`relative inline-flex ${className}`}>
      <select
        aria-label="Filter by status"
        className="rk-select w-full appearance-none cursor-pointer pr-10 text-sm font-semibold text-slate"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
      <svg aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
    </span>
  );
}
