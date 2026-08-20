"use client";

import { useState } from "react";
import { requestRelayCellCode, verifyRelayCellCode } from "@/lib/settings-actions";

const input =
  "w-full rounded-xl border border-slate/20 px-4 py-3 text-base outline-none focus:border-blue";

export default function PhoneVerificationPanel({
  initialPhone,
  initialVerified,
  onVerified,
  verifiedActionLabel,
}: {
  initialPhone: string;
  initialVerified: boolean;
  onVerified?: () => void;
  verifiedActionLabel?: string;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"idle" | "code_sent" | "verified">(
    initialVerified ? "verified" : "idle",
  );
  const [state, setState] = useState<"" | "saving" | "saved" | string>("");

  const isVerified = stage === "verified" && Boolean(phone.trim());

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setState("saving");
    const res = await fn();
    if (!res.ok) {
      setState(res.error ?? "Could not verify that number.");
      return;
    }
    setState("saved");
    after?.();
    setTimeout(() => setState(""), 2000);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-sky-line bg-white shadow-soft">
      <div className="border-b border-sky-line bg-sky/50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">Owner phone</p>
            <h3 className="display text-2xl text-blue-ink">Verify your real number.</h3>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate">
              Calls to your ReKnock line can forward here, and urgent lead
              alerts have a safe fallback. Replies still live in email and the
              ReKnock inbox. We verify this number so a typo never routes a
              customer call to the wrong phone.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isVerified ? "bg-mint/15 text-mint" : "bg-amber/15 text-amber"
            }`}
          >
            {isVerified ? "Verified" : "Unverified"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-[1.2fr_0.8fr]">
        <div>
          <label className="block text-sm font-semibold text-slate">
            Mobile number
            <input
              className="mt-2 w-full rounded-xl border border-slate/20 px-4 py-3 text-base outline-none focus:border-blue"
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setCode("");
                setStage("idle");
                setState("");
              }}
              placeholder="(555) 123-4567"
            />
          </label>

          {stage === "code_sent" ? (
            <div className="mt-4 rounded-xl border border-sky-line bg-sky/40 p-4">
              <p className="text-sm font-semibold text-blue-ink">
                Enter the 6-digit code we texted to {phone}.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  className={`${input} max-w-[11rem] text-center font-mono tracking-[0.35em]`}
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                />
                <button
                  type="button"
                  disabled={state === "saving" || code.length !== 6}
                  onClick={() =>
                    run(() => verifyRelayCellCode(code), () => {
                      setStage("verified");
                      setCode("");
                      onVerified?.();
                    })
                  }
                  className="btn btn-primary"
                >
                  {state === "saving" ? "Checking..." : "Verify"}
                </button>
                <button
                  type="button"
                  className="cursor-pointer text-sm font-semibold text-blue underline"
                  onClick={() => run(() => requestRelayCellCode(phone))}
                >
                  Resend code
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={state === "saving" || !phone.trim()}
                onClick={() =>
                  run(() => requestRelayCellCode(phone), () => setStage("code_sent"))
                }
                className="btn btn-primary"
              >
                {state === "saving" ? "Texting you a code..." : "Text me a code"}
              </button>
              {isVerified && verifiedActionLabel ? (
                <button type="button" className="btn btn-ghost" onClick={onVerified}>
                  {verifiedActionLabel}
                </button>
              ) : null}
            </div>
          )}

          {state === "saved" ? (
            <p className="mt-3 text-sm font-semibold text-mint">
              Number verified.
            </p>
          ) : state && state !== "saving" ? (
            <p className="mt-3 text-sm font-semibold text-red-700">{state}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-sky-line bg-[#f8fbff] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue">
            What this unlocks
          </p>
          <div className="mt-4 space-y-3 text-sm text-slate">
            <p>
              <span className="font-semibold text-ink">Call forwarding.</span>{" "}
              Prospects can call the ReKnock number and reach you.
            </p>
            <p>
              <span className="font-semibold text-ink">Safer alerts.</span>{" "}
              Urgent fallbacks never route to an unverified phone.
            </p>
            <p>
              <span className="font-semibold text-ink">Clean handoff.</span>{" "}
              Reply emails and the inbox stay the source of truth.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
