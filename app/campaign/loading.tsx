// Instant skeleton for the campaign editor.
export default function Loading() {
  return (
    <main className="app-bg">
      <div className="app-shell max-w-3xl">
        <div className="h-7 w-36 skeleton rounded-full bg-slate/10" />
        <div className="mt-4 h-9 w-72 max-w-full skeleton rounded-lg bg-slate/10" />
        <div className="mt-6 flex flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="app-panel h-40 skeleton rounded-2xl bg-slate/5" />
          ))}
        </div>
      </div>
    </main>
  );
}
