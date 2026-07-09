/* ReKnock logo - a message bubble with two "knock" arcs.
   The bubble = the follow-up text; the arcs = knocking again.
   Pass mode="dark" on dark backgrounds. */

export function LogoIcon({
  size = 32,
  mode = "light",
  animated = false,
}: {
  size?: number;
  mode?: "light" | "dark" | "mono";
  animated?: boolean;
}) {
  const bubble =
    mode === "dark" ? "#ffffff" : mode === "mono" ? "#101828" : "#1d5fdb";
  const arcs =
    mode === "dark" ? "#8ab2ff" : mode === "mono" ? "#101828" : "#1d5fdb";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* bubble */}
      <path
        d="M8 22c0-7.732 6.268-14 14-14h14c7.732 0 14 6.268 14 14v8c0 7.732-6.268 14-14 14H24l-10 9v-9.685C10.5 41.02 8 36.3 8 30.999V22z"
        fill={bubble}
      />
      {/* double chevron = knock again */}
      <path
        d="M23 19l8 7-8 7"
        stroke={mode === "dark" ? "#1d5fdb" : "#ffffff"}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M34 19l8 7-8 7"
        stroke={mode === "dark" ? "#1d5fdb" : "#ffffff"}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
      {/* knock arcs */}
      <g className={animated ? "knock" : undefined}>
        <path
          d="M52 8c3.5 3.5 5.5 7.5 6 12"
          stroke={arcs}
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M47 12c2.4 2.4 3.8 5.2 4.2 8.3"
          stroke={arcs}
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.5"
        />
      </g>
    </svg>
  );
}

export function Logo({
  mode = "light",
  animated = false,
}: {
  mode?: "light" | "dark" | "mono";
  animated?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <LogoIcon size={30} mode={mode} animated={animated} />
      <span
        className="display text-2xl tracking-tight"
        style={{ color: mode === "dark" ? "#ffffff" : "#101828" }}
      >
        Re<span style={{ color: mode === "dark" ? "#8ab2ff" : "#1d5fdb" }}>Knock</span>
      </span>
    </span>
  );
}
