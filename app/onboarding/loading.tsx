// Instant skeleton while onboarding loads its (now parallelized) initial data.
export default function Loading() {
  return (
    <div className="mx-auto max-w-lg px-5 py-12">
      <div className="mb-8">
        <div className="h-3 w-24 animate-pulse rounded bg-slate/10" />
        <div className="mt-2 flex gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="h-1.5 flex-1 animate-pulse rounded-full bg-slate/10" />
          ))}
        </div>
      </div>
      <div className="h-9 w-64 animate-pulse rounded-lg bg-slate/10" />
      <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate/5" />
      <div className="mt-6 flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded-xl bg-slate/5" />
        ))}
      </div>
    </div>
  );
}
