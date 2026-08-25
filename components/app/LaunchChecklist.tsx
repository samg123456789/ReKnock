import Link from "next/link";

export type LaunchChecklistItem = {
  label: string;
  detail: string;
  done: boolean;
  href?: string;
};

export default function LaunchChecklist({ items }: { items: LaunchChecklistItem[] }) {
  const complete = items.filter((item) => item.done).length;
  const next = items.find((item) => !item.done);

  return (
    <section className="app-panel mt-8 p-6 md:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="surface-label text-blue">First customer launch</p>
          <h2 className="display mt-1 text-2xl">Your launch checklist</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate">
            Finish these once and your first quote can move from intake to a safe, approved follow-up sequence.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-sky px-3 py-1.5 text-sm font-semibold text-blue-ink">
          {complete}/{items.length} complete
        </span>
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-2">
        {items.map((item) => {
          const content = (
            <div className={`surface-card-compact flex items-start gap-3 ${!item.done && item.href ? "transition-colors hover:border-blue/40 hover:bg-sky/30" : ""}`}>
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.done ? "bg-mint/15 text-mint" : "border border-slate/25 text-mist"}`}>
                {item.done ? "✓" : ""}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${item.done ? "text-ink" : "text-slate"}`}>{item.label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-mist">{item.detail}</span>
              </span>
              {!item.done && item.href ? <span className="ml-auto shrink-0 pt-0.5 text-sm font-semibold text-blue">→</span> : null}
            </div>
          );
          return item.href && !item.done ? <Link key={item.label} href={item.href}>{content}</Link> : <div key={item.label}>{content}</div>;
        })}
      </div>

      {next ? (
        <p className="mt-4 text-sm text-slate">
          Next up: <span className="font-semibold text-ink">{next.label}</span>
        </p>
      ) : (
        <p className="mt-4 text-sm font-semibold text-mint">You’re ready for your next customer.</p>
      )}
    </section>
  );
}
