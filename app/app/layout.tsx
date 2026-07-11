import { getActingCompany } from "@/lib/acting-company";
import { exitViewAs } from "@/lib/admin-actions";

// Shows the support-mode banner whenever an admin is viewing as a customer.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const acting = await getActingCompany();
  return (
    <>
      {acting?.impersonating ? (
        <div className="sticky top-16 z-40 flex items-center justify-center gap-3 bg-amber px-4 py-2 text-center text-sm font-semibold text-white">
          <span>Support mode: viewing as {acting.companyName ?? "customer"}</span>
          <form action={exitViewAs}>
            <button type="submit" className="cursor-pointer rounded-full bg-white/25 px-3 py-0.5 hover:bg-white/40">
              Exit
            </button>
          </form>
        </div>
      ) : null}
      {children}
    </>
  );
}
