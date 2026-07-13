"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { normalizePhone } from "@/lib/phone";
import { parseCsv, mapHeader, CSV_ROW_CAP, CSV_TEMPLATE, type CsvColumn } from "@/lib/csv";
import { bulkCreateProspects, type CsvProspectRow, type CsvImportResult } from "@/lib/csv-actions";

const primaryBtn =
  "btn btn-primary btn-lg";
const ghostBtn = "btn btn-ghost btn-lg";

type ParsedRow = {
  line: number; // 1-based data-row number in the file (header not counted)
  fields: CsvProspectRow;
  flags: string[]; // warnings, row still imports (e.g. unclear date)
  problems: string[]; // blockers, row is skipped (missing name/phone)
};

const TEMPLATE_HREF = "data:text/csv;charset=utf-8," + encodeURIComponent(CSV_TEMPLATE);

function goodDate(raw: string): boolean {
  const t = raw.trim();
  return t === "" || /^\d{4}-\d{2}-\d{2}$/.test(t) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t);
}

function parseFile(text: string): { rows: ParsedRow[]; error: string | null } {
  const table = parseCsv(text);
  if (table.length < 2) {
    return { rows: [], error: "That file looks empty. It needs a header row plus at least one customer." };
  }
  const cols = mapHeader(table[0]);
  if (cols.first_name == null || cols.phone == null) {
    return {
      rows: [],
      error: "We could not find the first_name and phone columns. Download the template below and match its headers.",
    };
  }
  const cell = (r: string[], c: CsvColumn) => {
    const idx = cols[c];
    return idx == null ? "" : (r[idx] ?? "").trim();
  };
  const rows = table.slice(1).map((r, i): ParsedRow => {
    const fields: CsvProspectRow = {
      first_name: cell(r, "first_name"),
      last_name: cell(r, "last_name"),
      phone: cell(r, "phone"),
      email: cell(r, "email"),
      address: cell(r, "address"),
      job_type: cell(r, "job_type"),
      quote_amount: cell(r, "quote_amount"),
      quote_date: cell(r, "quote_date"),
    };
    const problems: string[] = [];
    const flags: string[] = [];
    if (!fields.first_name) problems.push("No first name");
    if (!normalizePhone(fields.phone)) problems.push(fields.phone ? "Bad phone number" : "No phone number");
    if (!goodDate(fields.quote_date)) {
      flags.push("Date unclear, we will use today");
      fields.quote_date = "";
    }
    return { line: i + 1, fields, flags, problems };
  });
  return { rows, error: null };
}

export default function CsvImport() {
  const router = useRouter();
  // Esc backs out one level: review -> file picker, picker -> dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setRows((r) => {
        if (r) return null;
        router.push("/app");
        return r;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  const closeX = (
    <button
      type="button"
      aria-label="Close"
      title="Close (Esc)"
      onClick={() => router.push("/app")}
      className="flex h-9 w-9 items-center justify-center rounded-full text-slate transition-colors hover:bg-slate/10 hover:text-ink"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  );
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [enroll, setEnroll] = useState(true);
  const [pending, setPending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [serverErrorLines, setServerErrorLines] = useState<Array<{ line: number; message: string }>>([]);

  const validRows = useMemo(() => (rows ?? []).filter((r) => r.problems.length === 0), [rows]);
  const invalidCount = (rows?.length ?? 0) - validRows.length;
  const overCap = (rows?.length ?? 0) > CSV_ROW_CAP;

  async function onFile(file: File | null) {
    if (!file) return;
    setParseError(null);
    setResult(null);
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setParseError("That is not a CSV file. Save your spreadsheet as CSV and try again.");
      return;
    }
    const text = await file.text();
    const parsed = parseFile(text);
    if (parsed.error) {
      setParseError(parsed.error);
      setRows(null);
      return;
    }
    setFileName(file.name);
    setRows(parsed.rows);
  }

  async function runImport() {
    if (!validRows.length || !consent || overCap) return;
    setPending(true);
    setParseError(null);
    const res = await bulkCreateProspects(
      validRows.map((r) => r.fields),
      enroll,
    );
    setPending(false);
    // Server error rows are 1-based over the array we sent; map back to file lines.
    setServerErrorLines(
      res.errors
        .filter((e) => e.row > 0)
        .map((e) => ({ line: validRows[e.row - 1]?.line ?? e.row, message: e.message })),
    );
    if (!res.ok) {
      setParseError(res.errors[0]?.message ?? "The import failed. Please try again.");
      return;
    }
    setResult(res);
  }

  function reset() {
    setRows(null);
    setFileName("");
    setParseError(null);
    setConsent(false);
    setEnroll(true);
    setResult(null);
    setServerErrorLines([]);
  }

  // ---------- done ----------
  if (result) {
    return (
      <div>
        <p className="eyebrow mb-3">Import finished</p>
        <h1 className="display text-3xl md:text-4xl">
          {result.imported > 0 ? `${result.imported} customer${result.imported === 1 ? "" : "s"} added.` : "Nothing new to add."}
        </h1>
        <div className="mt-6 flex flex-col gap-2">
          <div className="flex items-center gap-3 rounded-xl border border-sky-line bg-white px-4 py-3">
            <span className="text-mint">✓</span>
            <span className="text-ink">{result.imported} imported{enroll && result.imported > 0 ? ", follow-ups scheduled" : ""}</span>
          </div>
          {result.skippedDuplicates > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-sky-line bg-white px-4 py-3">
              <span className="text-slate">-</span>
              <span className="text-slate">{result.skippedDuplicates} skipped, already in your quotes (matched by phone)</span>
            </div>
          )}
          {serverErrorLines.map((e, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-amber/40 bg-amber/5 px-4 py-3">
              <span className="text-amber">!</span>
              <span className="text-slate">Row {e.line}: {e.message}</span>
            </div>
          ))}
        </div>
        {enroll && result.imported > 0 && (
          <p className="mt-4 rounded-xl bg-sky px-4 py-3 text-sm text-blue-ink">
            Follow-ups go out in your voice, inside your sending hours, and stop the second someone replies.
          </p>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/app" className={primaryBtn}>Back to dashboard</Link>
          <button className={ghostBtn} onClick={reset}>Import another file</button>
        </div>
      </div>
    );
  }

  // ---------- preview ----------
  if (rows) {
    const preview = rows.slice(0, 10);
    return (
      <div>
        <div className="flex items-start justify-between">
          <p className="eyebrow mb-3">Check the list</p>
          {closeX}
        </div>
        <h1 className="display text-3xl md:text-4xl">Here is what we found.</h1>
        <p className="mt-3 text-slate">
          {fileName}: {rows.length} row{rows.length === 1 ? "" : "s"}. {validRows.length} ready to import
          {invalidCount > 0 ? `, ${invalidCount} skipped (missing a name or a good phone number)` : ""}.
        </p>

        {overCap && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            That is {rows.length} rows. The limit is {CSV_ROW_CAP} per import. Split the file into smaller batches and try again.
          </p>
        )}

        <div className="card mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-sky-line text-left text-slate">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Job</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Quote date</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => (
                <tr key={r.line} className={`border-b border-sky-line/60 last:border-0 ${r.problems.length ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2.5 text-ink">{`${r.fields.first_name} ${r.fields.last_name}`.trim() || "-"}</td>
                  <td className="px-4 py-2.5">{r.fields.phone || "-"}</td>
                  <td className="px-4 py-2.5">{r.fields.job_type || "-"}</td>
                  <td className="px-4 py-2.5">{r.fields.quote_amount || "-"}</td>
                  <td className="px-4 py-2.5">{r.fields.quote_date || "today"}</td>
                  <td className="px-4 py-2.5">
                    {r.problems.length ? (
                      <span className="font-semibold text-red-600">{r.problems.join(", ")}</span>
                    ) : r.flags.length ? (
                      <span className="text-amber">{r.flags.join(", ")}</span>
                    ) : (
                      <span className="text-mint">Ready</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 10 && (
            <p className="border-t border-sky-line px-4 py-3 text-sm text-slate">And {rows.length - 10} more rows.</p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-blue" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="text-ink">
              I have permission to text these customers about their quotes.
              <span className="block text-sm text-slate">Required. This records how each customer agreed to hear from you.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-blue" checked={enroll} onChange={(e) => setEnroll(e.target.checked)} />
            <span className="text-ink">
              Also start follow-ups now
              <span className="block text-sm text-slate">We schedule the chase from each quote date, in your voice, inside your sending hours.</span>
            </span>
          </label>
        </div>

        {parseError ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{parseError}</p> : null}

        <div className="mt-8 flex items-center justify-between gap-3">
          <button className={ghostBtn} disabled={pending} onClick={reset}>Back</button>
          <button className={primaryBtn} disabled={pending || !consent || !validRows.length || overCap} onClick={runImport}>
            {pending
              ? "Importing..."
              : `Import ${validRows.length} customer${validRows.length === 1 ? "" : "s"}`}
          </button>
        </div>
        {pending && <p className="mt-3 text-sm text-slate">Adding your customers and scheduling follow-ups. Hang tight, this can take a few seconds.</p>}
      </div>
    );
  }

  // ---------- pick a file ----------
  return (
    <div>
      <div className="flex items-start justify-between">
        <p className="eyebrow mb-3">Bulk import</p>
        {closeX}
      </div>
      <h1 className="display text-3xl md:text-4xl">Upload a CSV of quotes.</h1>
      <p className="mt-3 text-slate">
        Export your list from a spreadsheet as CSV, up to {CSV_ROW_CAP} rows at a time. We need at least a first name and a phone number per row.
      </p>

      <label
        className={`card mt-6 flex cursor-pointer flex-col items-center gap-2 p-7 text-center ${dragOver ? "border-blue bg-sky/40" : "border-blue hover:bg-sky/40"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFile(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <span className="text-lg font-semibold text-ink">Choose a CSV file</span>
        <span className="text-sm text-slate">Or drag and drop it here.</span>
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </label>

      {parseError ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{parseError}</p> : null}

      <p className="mt-6 text-sm text-slate">
        Columns: first_name, last_name, phone, email, address, job_type, quote_amount, quote_date. Any order works, extra columns are ignored.
      </p>
      <a href={TEMPLATE_HREF} download="reknock-import-template.csv" className="mt-2 inline-block text-sm text-blue underline">
        Download the template
      </a>
    </div>
  );
}
