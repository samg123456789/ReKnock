"use client";

import { useState } from "react";
import { enterViewAs, suspendCompany, deleteCompany } from "@/lib/admin-actions";

export default function CompanyActions({
  companyId,
  companyName,
  suspended,
}: {
  companyId: string;
  companyName: string;
  suspended: boolean;
}) {
  const [modal, setModal] = useState<null | "suspend" | "delete">(null);
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    const res = modal === "delete" ? await deleteCompany(companyId, confirm) : await suspendCompany(companyId, confirm);
    setPending(false);
    if (res && res.ok === false) return setError(res.error);
    location.reload();
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <form action={enterViewAs.bind(null, companyId)}>
        <button type="submit" className="btn btn-primary btn-sm">
          View as customer
        </button>
      </form>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => { setModal("suspend"); setConfirm(""); setError(null); }}
      >
        {suspended ? "Unsuspend" : "Suspend"}
      </button>
      <button
        type="button"
        className="btn btn-sm border border-red-300 text-red-700 hover:bg-red-50"
        onClick={() => { setModal("delete"); setConfirm(""); setError(null); }}
      >
        Delete
      </button>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <h3 className="display text-xl">
              {modal === "delete" ? "Delete this customer?" : suspended ? "Unsuspend this customer?" : "Suspend this customer?"}
            </h3>
            <p className="mt-2 text-sm text-slate">
              {modal === "delete"
                ? "This cancels their subscription, releases their number, and permanently removes their data. This cannot be undone."
                : suspended
                  ? "This restores their sending and access."
                  : "This pauses all their sending and access until you unsuspend."}
            </p>
            <p className="mt-3 text-sm text-slate">Type <span className="font-semibold text-ink">{companyName}</span> to confirm.</p>
            <input className="mt-2 w-full rounded-xl border border-slate/20 px-4 py-2.5 outline-none focus:border-blue" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-slate" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || confirm.trim() !== companyName}
                className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${modal === "delete" ? "bg-red-600" : "bg-blue"}`}
                onClick={run}
              >
                {pending ? "Working..." : modal === "delete" ? "Delete forever" : suspended ? "Unsuspend" : "Suspend"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
