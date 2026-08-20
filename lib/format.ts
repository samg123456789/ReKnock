// Shared display formatting. Safe to import from client and server (and from
// prompt builders: the model echoes whatever formatting we hand it, so amounts
// must be formatted before they reach a prompt).

// "$10,672.20" / "$8,500" (cents only when the amount has them).
export function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  const hasCents = Math.round(n * 100) % 100 !== 0;
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}
