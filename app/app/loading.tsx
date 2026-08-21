// Instant skeleton while the dashboard server component fetches. Renders under
// the app shell header so navigation feels immediate instead of dead.
export default function Loading() {
  return (
    <main className="app-bg">
      <div className="app-shell">
        <div className="ai-panel p-6">
          <div className="h-7 w-36 skeleton rounded-full bg-slate/10" />
          <div className="mt-4 h-11 w-72 max-w-full skeleton rounded-lg bg-slate/10" />
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 skeleton rounded-2xl bg-slate/5" />)}
          </div>
        </div>
        <div className="app-panel mt-8 p-6">
          <div className="h-10 w-full skeleton rounded-xl bg-slate/5" />
          <div className="mt-3 flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 skeleton rounded-xl bg-slate/5" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
