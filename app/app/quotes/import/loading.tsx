// Instant skeleton for the CSV import screen.
export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <div className="h-3 w-16 animate-pulse rounded bg-slate/10" />
      <div className="mt-3 h-9 w-64 animate-pulse rounded-lg bg-slate/10" />
      <div className="mt-3 h-4 w-72 animate-pulse rounded bg-slate/5" />
      <div className="mt-6 h-32 w-full animate-pulse rounded-xl bg-slate/5" />
      <div className="mt-6 h-4 w-80 animate-pulse rounded bg-slate/5" />
    </main>
  );
}
