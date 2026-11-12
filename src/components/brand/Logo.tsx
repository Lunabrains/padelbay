// The official Padel Bay wordmark (from padelbaycourts.com), used as a CSS mask so it can be
// rendered two-tone like the Instagram avatar: teal "padel", sage "bay", or in a single colour.

export function Logo({ className = "", tone = "duo", title = "Padel Bay" }: { className?: string; tone?: "duo" | "white" | "teal" | "ink"; title?: string }) {
  const bg =
    tone === "duo"
      ? "linear-gradient(90deg, var(--pb-teal) 0 61.6%, var(--pb-sage) 61.6% 100%)"
      : tone === "white"
        ? "#ffffff"
        : tone === "teal"
          ? "var(--pb-teal)"
          : "var(--pb-ink)";
  return <span role="img" aria-label={title} className={`pb-logo inline-block ${className}`} style={{ background: bg }} />;
}

export function LogoDuoLight({ className = "" }: { className?: string }) {
  // On dark backgrounds the teal is too quiet: white "padel", sage "bay".
  return (
    <span
      role="img"
      aria-label="Padel Bay"
      className={`pb-logo inline-block ${className}`}
      style={{ background: "linear-gradient(90deg, #ffffff 0 61.6%, var(--pb-sage) 61.6% 100%)" }}
    />
  );
}
