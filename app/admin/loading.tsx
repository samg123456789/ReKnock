// Instant skeleton for the admin dashboard.
export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="h-8 w-40 skeleton rounded-lg bg-slate/10" />
      <div className="mt-6 flex flex-col gap-1.5">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-11 w-full skeleton rounded-lg bg-slate/5" />
        ))}
      </div>
    </main>
  );
}
