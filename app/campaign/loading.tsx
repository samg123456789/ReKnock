// Instant skeleton for the campaign editor.
export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <div className="h-3 w-28 skeleton rounded bg-slate/10" />
      <div className="mt-3 h-8 w-64 skeleton rounded-lg bg-slate/10" />
      <div className="mt-6 flex flex-col gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-40 skeleton rounded-2xl bg-slate/5" />
        ))}
      </div>
    </main>
  );
}
