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

/** The full mark, same drawing as public/favicon.svg: the T-pin on a folded map. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="14" fill="var(--color-ink)" />
      <path d="M7 25 L22 20 L22 56 L7 60 Z" fill="#EFE8D6" />
      <path d="M22 20 L42 26 L42 62 L22 56 Z" fill="#D9CBA6" />
      <path d="M42 26 L57 21 L57 57 L42 62 Z" fill="#EFE8D6" />
      <path d="M42 44 C47 41 52 43 57 40 L57 57 L42 62 Z" fill="#9CC4CA" />
      <path
        d="M11 53 C17 49 20 42 27 44 S33 47 36 43"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="0.1 5.2"
      />
      <path
        d="M19 10.5 A4.5 4.5 0 0 1 23.5 6 H48.5 A4.5 4.5 0 0 1 53 10.5 V13 A4.5 4.5 0 0 1 48.5 17.5 H42 L36 44 L30 17.5 H23.5 A4.5 4.5 0 0 1 19 13 Z"
        fill="var(--color-pin)"
        stroke="var(--color-ink)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Wordmark: the map-and-pin mark in front of the name. */
export function Logo({
  inverse = false,
  className = "",
}: {
  inverse?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark
        className={`h-[1.5em] w-auto ${inverse ? "rounded-[0.35em] ring-1 ring-white/25" : ""}`}
      />
      <span className="font-display font-bold tracking-[-0.03em]">TripMyWay</span>
    </span>
  );
}
