import { requireAdmin } from "@/lib/admin";

// Every /admin route is gated here. Non-admins (and logged-out) get a 404.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6 flex items-center gap-2">
        <span className="rounded-full bg-blue px-2.5 py-1 text-xs font-bold tracking-wide text-white">ADMIN</span>
        <span className="text-sm text-mist">Platform admin</span>
      </div>
      {children}
    </div>
  );
}
