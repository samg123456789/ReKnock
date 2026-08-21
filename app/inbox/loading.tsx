// Instant skeleton for the inbox while conversations load.
export default function Loading() {
  return (
    <main className="app-bg grid min-h-[calc(100dvh-4rem)] md:grid-cols-[360px_1fr]">
      <div className="border-r border-sky-line bg-white/82 p-3">
        <div className="h-8 w-32 skeleton rounded-lg bg-slate/10" />
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 skeleton rounded-xl bg-slate/5" />
          ))}
        </div>
      </div>
      <div className="hidden p-6 md:block">
        <div className="app-panel h-full p-8">
          <div className="h-7 w-44 skeleton rounded-full bg-slate/10" />
          <div className="mt-4 h-4 w-72 skeleton rounded bg-slate/5" />
        </div>
      </div>
    </main>
  );
}
