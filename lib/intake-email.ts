// Shared quote-intake address. One address for every tenant; inbound mail is
// matched to a company by the sender's verified email (company_sender_emails),
// Ramp receipts@ style. Safe to import from client and server.

// Subdomain, not root: the root domain's MX belongs to ImprovMX forwarding
// (founder decision 2026-07-13, option B).
export const INTAKE_EMAIL = "quotes@in.getreknock.com";

// "Jim's Roofing <jim@apexroofs.com>" -> "jim@apexroofs.com" (lowercased).
export function bareEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/<([^<>\s]+@[^<>\s]+)>/) ?? raw.match(/([^<>\s"',;]+@[^<>\s"',;]+)/);
  return m ? m[1].toLowerCase() : null;
}
