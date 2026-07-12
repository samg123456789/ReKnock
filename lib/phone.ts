// Shared US phone normalization. Same rules the add-quote flow uses:
// 10 digits -> +1XXXXXXXXXX, 11 starting with 1 -> +XXXXXXXXXXX,
// anything already starting with + and at least 8 digits is kept.
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  return null;
}
