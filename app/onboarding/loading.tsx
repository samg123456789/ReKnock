// Instant skeleton while onboarding loads its (now parallelized) initial data.
export default function Loading() {
  return (
    <div className="app-bg">
      <div className="app-shell grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="app-panel p-5">
          <div className="h-7 w-28 skeleton rounded-full bg-slate/10" />
          <div className="mt-4 h-8 w-48 skeleton rounded-lg bg-slate/10" />
          <div className="mt-6 flex flex-col gap-3">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-7 skeleton rounded-full bg-slate/5" />)}
          </div>
        </div>
        <div className="app-panel p-6">
          <div className="h-9 w-64 skeleton rounded-lg bg-slate/10" />
          <div className="mt-3 h-4 w-full skeleton rounded bg-slate/5" />
          <div className="mt-6 flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 w-full skeleton rounded-xl bg-slate/5" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
