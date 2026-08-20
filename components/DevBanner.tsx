// Amber banner shown on every non-production deploy (Preview + local dev).
// Vercel sets VERCEL_ENV to "production" | "preview" | "development".
// It is undefined when running locally, which we also treat as non-production.
export default function DevBanner() {
  const env = process.env.VERCEL_ENV;
  if (env === "production") return null;

  const label = env === "preview" ? "DEV (preview)" : "DEV (local)";

  return (
    <div
      role="status"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 9999,
        width: "100%",
        background: "#f59e0b",
        color: "#1c1917",
        textAlign: "center",
        fontFamily: "var(--font-mono, monospace)",
        fontSize: "13px",
        fontWeight: 600,
        letterSpacing: "0.02em",
        padding: "6px 12px",
      }}
    >
      {label} - not the live site. Test data only.
    </div>
  );
}
