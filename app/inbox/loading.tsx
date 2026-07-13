// Instant skeleton for the inbox while conversations load.
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <div className="h-3 w-16 skeleton rounded bg-slate/10" />
      <div className="mt-3 h-8 w-40 skeleton rounded-lg bg-slate/10" />
      <div className="mt-6 flex flex-col gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-slate/10 px-4 py-3">
            <div className="h-10 w-10 skeleton rounded-full bg-slate/10" />
            <div className="flex-1">
              <div className="h-4 w-32 skeleton rounded bg-slate/10" />
              <div className="mt-2 h-3 w-48 skeleton rounded bg-slate/5" />
            </div>
            <div className="h-6 w-16 skeleton rounded-full bg-slate/10" />
          </div>
        ))}
      </div>
    </main>
  );
}
