"use client";

import { useEffect, useState } from "react";

const examples = [1, 2, 3] as const;

export default function SmsExchangeGallery() {
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (selected === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
      if (event.key === "ArrowLeft") setSelected((current) => current === null ? 1 : current === 1 ? 3 : current - 1);
      if (event.key === "ArrowRight") setSelected((current) => current === null ? 1 : current === 3 ? 1 : current + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [selected]);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setSelected(example)}
            className="group cursor-pointer rounded-lg border border-sky-line bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue focus:ring-offset-2"
            aria-label={"Open SMS exchange example " + example}
          >
            <img
              src={"/compliance/sms-exchange-" + example + ".svg"}
              alt={"Sample ReKnock SMS exchange " + example}
              className="w-full rounded-lg"
            />
            <span className="block border-t border-sky-line px-4 py-3 text-sm font-semibold text-blue">
              View exchange {example} <span aria-hidden>+</span>
            </span>
          </button>
        ))}
      </div>

      {selected !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={"SMS exchange example " + selected}
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <div className="relative flex max-h-full w-full max-w-5xl flex-col rounded-xl bg-white p-3 shadow-2xl sm:p-5">
            <div className="flex items-center justify-between gap-4 px-1 pb-3">
              <p className="font-semibold text-ink">SMS exchange {selected} of 3</p>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="cursor-pointer rounded-lg border border-slate/20 px-3 py-2 text-sm font-semibold text-slate hover:border-blue hover:text-blue"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 overflow-auto rounded-lg bg-sky/40">
              <img
                src={"/compliance/sms-exchange-" + selected + ".svg"}
                alt={"Expanded SMS exchange example " + selected}
                className="mx-auto h-auto w-full"
              />
            </div>
            <div className="flex items-center justify-between gap-3 pt-3">
              <button
                type="button"
                onClick={() => setSelected(selected === 1 ? 3 : selected - 1)}
                className="cursor-pointer rounded-lg border border-slate/20 px-3 py-2 text-sm font-semibold text-blue hover:border-blue"
              >
                Previous
              </button>
              <div className="flex gap-1.5" aria-label="Choose exchange">
                {examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setSelected(example)}
                    className={"h-2.5 w-2.5 cursor-pointer rounded-full " + (selected === example ? "bg-blue" : "bg-slate/25")}
                    aria-label={"Show exchange " + example}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSelected(selected === 3 ? 1 : selected + 1)}
                className="cursor-pointer rounded-lg border border-slate/20 px-3 py-2 text-sm font-semibold text-blue hover:border-blue"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
