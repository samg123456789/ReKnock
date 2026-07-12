// Instant skeleton while the dashboard server component fetches. Renders under
// the app shell header so navigation feels immediate instead of dead.
export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <div className="h-3 w-20 animate-pulse rounded bg-slate/10" />
      <div className="mt-3 h-9 w-64 animate-pulse rounded-lg bg-slate/10" />
      <div className="mt-5 flex gap-2">
        <div className="h-7 w-32 animate-pulse rounded-full bg-slate/10" />
        <div className="h-7 w-40 animate-pulse rounded-full bg-slate/10" />
      </div>
      <div className="mt-8 flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate/5" />
        ))}
      </div>
    </main>
  );
}
