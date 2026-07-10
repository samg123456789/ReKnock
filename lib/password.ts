// Shared password rules, imported by both the signup form (live UI) and the
// server action (enforcement). Keep this the single source of truth so the two
// can never drift apart.

export type PasswordChecks = {
  length: boolean; // at least 8 characters
  capital: boolean; // at least one A-Z
  symbol: boolean; // at least one non-alphanumeric
};

export const PASSWORD_RULES = [
  { key: "length" as const, label: "At least 8 characters" },
  { key: "capital" as const, label: "One capital letter" },
  { key: "symbol" as const, label: "One symbol (like ! or #)" },
];

export function checkPassword(pw: string): PasswordChecks {
  return {
    length: pw.length >= 8,
    capital: /[A-Z]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
}

export function passwordValid(pw: string): boolean {
  const c = checkPassword(pw);
  return c.length && c.capital && c.symbol;
}

export const PASSWORD_REQUIREMENTS_MESSAGE =
  "Password needs at least 8 characters, one capital letter, and one symbol.";

// 0-4 score for the strength meter. Requires the 3 rules first; extra length
// and a digit push it toward "Strong".
export function passwordStrength(pw: string): { score: number; label: "Weak" | "Okay" | "Strong" } {
  if (!pw) return { score: 0, label: "Weak" };
  const c = checkPassword(pw);
  let score = 0;
  if (c.length) score++;
  if (c.capital) score++;
  if (c.symbol) score++;
  if (pw.length >= 12) score++;
  if (/[0-9]/.test(pw)) score++;
  if (!passwordValid(pw)) return { score: Math.min(score, 2), label: "Weak" };
  const label = score >= 5 ? "Strong" : "Okay";
  return { score, label };
}
