// Instant skeleton while settings loads its (now parallelized) queries.
export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <div className="h-3 w-16 animate-pulse rounded bg-slate/10" />
      <div className="mt-3 h-8 w-40 animate-pulse rounded-lg bg-slate/10" />
      <div className="mt-8 flex flex-col gap-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-slate/10 p-5">
            <div className="h-4 w-32 animate-pulse rounded bg-slate/10" />
            <div className="mt-3 h-10 w-full animate-pulse rounded-lg bg-slate/5" />
          </div>
        ))}
      </div>
    </main>
  );
}
