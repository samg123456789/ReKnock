// Shared quote-intake address. One address for every tenant; inbound mail is
// matched to a company by the sender's verified email (company_sender_emails),
// Ramp receipts@ style. Safe to import from client and server.

// Root domain (founder decision 2026-07-13, revised): Resend's 1-domain free
// plan meant enabling receiving on getreknock.com itself; the root MX moves
// from ImprovMX to Resend, and any forwarding aliases get recreated in Resend.
export const INTAKE_EMAIL = "quotes@getreknock.com";

// "Jim's Roofing <jim@apexroofs.com>" -> "jim@apexroofs.com" (lowercased).
export function bareEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/<([^<>\s]+@[^<>\s]+)>/) ?? raw.match(/([^<>\s"',;]+@[^<>\s"',;]+)/);
  return m ? m[1].toLowerCase() : null;
}
