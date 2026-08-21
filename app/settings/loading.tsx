// Instant skeleton while settings loads its (now parallelized) queries.
export default function Loading() {
  return (
    <main className="app-bg">
      <div className="app-shell max-w-3xl">
        <div className="h-7 w-36 skeleton rounded-full bg-slate/10" />
        <div className="mt-4 h-9 w-48 skeleton rounded-lg bg-slate/10" />
        <div className="mt-8 flex flex-col gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="app-panel p-5">
              <div className="h-4 w-32 skeleton rounded bg-slate/10" />
              <div className="mt-3 h-10 w-full skeleton rounded-lg bg-slate/5" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
