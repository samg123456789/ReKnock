// RLS smoke test (spec Phase 8, first actual run 2026-07-13): signs in as the
// internal test user and verifies PostgREST refuses cross-tenant reads.
// Usage: node scripts/rls-smoke.mjs  (creds from .env.local)
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const login = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: KEY, "content-type": "application/json" },
  body: JSON.stringify({ email: "test@getreknock.com", password: "reknock123" }),
}).then((r) => r.json());
if (!login.access_token) { console.error("login failed"); process.exit(1); }
const h = { apikey: KEY, Authorization: `Bearer ${login.access_token}` };

const rest = (q) => fetch(`${URL_}/rest/v1/${q}`, { headers: h }).then((r) => r.json());

let fail = 0;
const check = (name, cond, detail) => { console.log(cond ? "PASS" : "FAIL", name, detail ?? ""); if (!cond) fail++; };

// 1. Own-company reads work and every row belongs to one company.
const own = await rest("prospects?select=company_id");
const companies = new Set((own ?? []).map((r) => r.company_id));
check("own prospects readable", Array.isArray(own) && own.length > 0, `rows=${own?.length}`);
check("single tenant in results", companies.size === 1, `companies=${companies.size}`);

// 2. A known other-tenant row (Jane Doe, company "Testing") must be invisible.
const cross = await rest("prospects?select=id&id=eq.4d3aa7cd-3aff-457e-ae2f-382241efed7a");
check("cross-tenant prospect invisible", Array.isArray(cross) && cross.length === 0, JSON.stringify(cross).slice(0, 80));

// 3. Cross-tenant tables: messages, events, companies limited to own row(s).
for (const t of ["messages", "events", "company_sender_emails", "reminders", "relay_sessions"]) {
  const rows = await rest(`${t}?select=company_id&limit=1000`);
  const cs = new Set((rows ?? []).map((r) => r.company_id));
  check(`${t} single-tenant`, Array.isArray(rows) && cs.size <= 1, `tenants=${cs.size}`);
}
const cos = await rest("companies?select=id");
check("companies visible = 1", Array.isArray(cos) && cos.length === 1, `rows=${cos?.length}`);

// 4. Cross-tenant WRITE must fail: try to update the other company's name.
const w = await fetch(`${URL_}/rest/v1/companies?id=eq.2c91e1ce-88b6-4ffd-beef-03968f0c7c9f`, {
  method: "PATCH", headers: { ...h, "content-type": "application/json", Prefer: "return=representation" },
  body: JSON.stringify({ name: "RLS-BREACH" }),
}).then((r) => r.json());
check("cross-tenant write blocked", Array.isArray(w) && w.length === 0, JSON.stringify(w).slice(0, 80));

console.log(fail === 0 ? "\nRLS SMOKE: ALL PASS" : `\nRLS SMOKE: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
