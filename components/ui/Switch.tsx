"use client";

// The design system's on/off control: a real switch, not a bare checkbox.
// Keyboard and screen-reader behavior come from the visually-hidden input.
export default function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-slate">
      {label ? <span className="w-6 text-right">{label}</span> : null}
      <span className="relative inline-flex h-5 w-9 shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="absolute inset-0 rounded-full bg-slate/25 transition-colors duration-150 peer-checked:bg-blue peer-focus-visible:ring-2 peer-focus-visible:ring-blue/40" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full border border-slate/10 bg-white transition-transform duration-150 peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
