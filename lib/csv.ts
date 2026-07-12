// Tiny hand-written CSV helpers shared by the import screen (client parse)
// and the bulk-create server action (row cap). No dependency needed for this.

export const CSV_ROW_CAP = 200;

export const CSV_COLUMNS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "address",
  "job_type",
  "quote_amount",
  "quote_date",
] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

export const CSV_TEMPLATE =
  "first_name,last_name,phone,email,address,job_type,quote_amount,quote_date\n" +
  'John,Smith,(555) 123-4567,john@example.com,"123 Main St, Springfield",Roof replacement,8500,2026-07-01\n';

// RFC-4180-ish parser: handles CRLF and LF line endings, quoted fields with
// embedded commas, quotes ("" escape), and newlines inside quotes. Fully
// empty lines are dropped.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      pushField();
      i++;
      continue;
    }
    if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      pushRow();
      i++;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

// Map a header row to column indexes. Case-insensitive, spaces become
// underscores ("First Name" works), extra columns ignored, order free.
export function mapHeader(cells: string[]): Partial<Record<CsvColumn, number>> {
  const map: Partial<Record<CsvColumn, number>> = {};
  cells.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/\s+/g, "_");
    if ((CSV_COLUMNS as readonly string[]).includes(key) && map[key as CsvColumn] == null) {
      map[key as CsvColumn] = i;
    }
  });
  return map;
}
