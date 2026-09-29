"use client";

import { useActionState } from "react";
import { joinWaitlist, type WaitlistState } from "@/lib/waitlist-actions";

const input = "rk-input text-base";

export default function WaitlistForm({ source = "pricing" }: { source?: string }) {
  const [state, action, pending] = useActionState<WaitlistState | undefined, FormData>(joinWaitlist, undefined);

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-mint/30 bg-mint/10 p-6 text-left">
        <p className="font-semibold text-ink">You&apos;re on the list.</p>
        <p className="mt-2 text-sm leading-relaxed text-slate">We saved your details. We&apos;ll use them to send a more useful invite when your trade and workflow are a fit.</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4 text-left">
      <input type="hidden" name="source" value={source} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1"><span className="text-sm font-semibold text-slate">Your name</span><input className={input} name="full_name" required placeholder="Mike Reyes" /></label>
        <label className="flex flex-col gap-1"><span className="text-sm font-semibold text-slate">Work email</span><input className={input} name="email" type="email" required placeholder="mike@reyesroofing.com" /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1"><span className="text-sm font-semibold text-slate">What kind of work do you do?</span><select className={input} name="trade" defaultValue=""><option value="" disabled>Pick a trade</option><option>Roofing</option><option>Painting</option><option>HVAC</option><option>Plumbing</option><option>Electrical</option><option>Landscaping</option><option>Remodeling</option><option>Other</option></select></label>
        <label className="flex flex-col gap-1"><span className="text-sm font-semibold text-slate">How many people quote jobs?</span><select className={input} name="team_size" defaultValue=""><option value="" disabled>Pick one</option><option>Just me</option><option>2 to 5</option><option>6 to 20</option><option>More than 20</option></select></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1"><span className="text-sm font-semibold text-slate">Quotes per month</span><select className={input} name="monthly_quotes" defaultValue=""><option value="" disabled>Pick one</option><option>1 to 10</option><option>11 to 30</option><option>31 to 100</option><option>More than 100</option></select></label>
        <label className="flex flex-col gap-1"><span className="text-sm font-semibold text-slate">Plan you care about</span><select className={input} name="interested_plan" defaultValue="Starter"><option>Starter</option><option>Not sure yet</option></select></label>
      </div>
      <label className="flex flex-col gap-1"><span className="text-sm font-semibold text-slate">What do you use to follow up today? <span className="font-normal text-mist">optional</span></span><textarea className={input} name="current_follow_up" rows={2} placeholder="Mostly texts, a spreadsheet, my CRM, or nothing consistent..." /></label>
      {state?.error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p> : null}
      <button className="btn btn-primary btn-lg w-full" disabled={pending}>{pending ? "Saving your spot..." : "Join the waitlist"}</button>
      <p className="text-center text-xs text-mist">No account or sales call is created. This only saves your request for access.</p>
    </form>
  );
}
