/** The TripMyWay T-pin (same shape as public/favicon.svg), drawn inline so it scales crisply. */
export function TPin({
  className = "",
  outline = "var(--color-ink)",
}: {
  className?: string;
  outline?: string;
}) {
  return (
    <svg viewBox="17 4 38 42" aria-hidden className={className}>
      <path
        d="M19 10.5 A4.5 4.5 0 0 1 23.5 6 H48.5 A4.5 4.5 0 0 1 53 10.5 V13 A4.5 4.5 0 0 1 48.5 17.5 H42 L36 44 L30 17.5 H23.5 A4.5 4.5 0 0 1 19 13 Z"
        fill="var(--color-pin)"
        stroke={outline}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Wordmark: the pin stands in front of the name. */
export function Logo({
  inverse = false,
  className = "",
}: {
  inverse?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <TPin className="h-[1.15em] w-auto" outline={inverse ? "transparent" : "var(--color-ink)"} />
      <span className="font-display font-bold tracking-[-0.03em]">TripMyWay</span>
    </span>
  );
}
