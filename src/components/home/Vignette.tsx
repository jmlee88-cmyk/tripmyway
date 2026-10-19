/**
 * Illustrated stand-ins for customer photos on the home page artwork (the
 * real prints use the customer's own photos). Each draws in a 100 × 100 box.
 */
export type VignetteKind = "lake" | "canal" | "cliff" | "city" | "coast";

export function VignetteArt({ kind }: { kind: VignetteKind }) {
  switch (kind) {
    case "lake":
      return (
        <>
          <rect width="100" height="100" fill="#cfe3ec" />
          <path d="M-5 70 L28 30 L48 55 L66 34 L105 72 Z" fill="#6e8da3" />
          <path d="M18 42 L28 30 L36 40 Z M60 40 L66 34 L72 41 Z" fill="#fbfbf8" />
          <path d="M-5 78 L20 58 L40 74 L70 56 L105 80 Z" fill="#3c5a72" />
          <rect y="72" width="100" height="28" fill="#8fbfcb" />
          <path d="M40 84 h18 l-3 4 h-12 Z" fill="#fbfbf8" />
          <path d="M20 79 h22 M60 92 h26" stroke="#cfe3ec" strokeWidth="1.5" />
        </>
      );
    case "canal":
      return (
        <>
          <rect width="100" height="100" fill="#f6d9a8" />
          <path d="M0 22 h22 v46 H0 Z" fill="#e7b75e" />
          <path d="M22 30 h20 v38 H22 Z" fill="#b4523a" />
          <path d="M60 26 h18 v42 H60 Z" fill="#e9c9a0" />
          <path d="M78 18 h22 v50 H78 Z" fill="#c9704a" />
          <path
            d="M5 30 h5 v8 h-5 Z M14 30 h5 v8 h-5 Z M5 46 h5 v8 h-5 Z M14 46 h5 v8 h-5 Z M27 38 h4 v7 h-4 Z M34 38 h4 v7 h-4 Z M64 34 h4 v7 h-4 Z M71 34 h4 v7 h-4 Z M83 28 h5 v8 h-5 Z M91 28 h5 v8 h-5 Z M83 44 h5 v8 h-5 Z M91 44 h5 v8 h-5 Z"
            fill="#5a3a2a"
            opacity="0.55"
          />
          <path d="M38 68 Q51 50 64 68" fill="none" stroke="#fbfbf8" strokeWidth="5" />
          <rect y="68" width="100" height="32" fill="#4e7e91" />
          <path d="M8 76 h20 M50 82 h30 M14 92 h24" stroke="#8fbfcb" strokeWidth="1.5" />
          <path d="M30 88 Q50 95 72 84 L74 86 Q50 99 28 90 Z" fill="#1b2a41" />
        </>
      );
    case "cliff":
      return (
        <>
          <rect width="100" height="100" fill="#cfe3ec" />
          <path d="M-5 100 L-5 36 Q20 28 44 40 Q70 52 105 46 L105 100 Z" fill="#7d8a5a" />
          <rect x="12" y="42" width="11" height="13" fill="#e9a9a0" />
          <rect x="24" y="44" width="10" height="16" fill="#f2b134" />
          <rect x="35" y="47" width="12" height="13" fill="#d97b4f" />
          <rect x="16" y="56" width="12" height="13" fill="#f3e3c3" />
          <rect x="29" y="61" width="11" height="12" fill="#c95b4a" />
          <rect x="41" y="60" width="10" height="14" fill="#f6d9a8" />
          <rect x="52" y="52" width="11" height="14" fill="#e9a9a0" />
          <path d="M-5 74 Q30 70 60 78 T105 74 V100 H-5 Z" fill="#3e86a0" />
          <path d="M10 84 h18 M52 90 h26" stroke="#8fbfcb" strokeWidth="1.5" />
        </>
      );
    case "city":
      return (
        <>
          <rect width="100" height="100" fill="#f3e3c3" />
          <circle cx="76" cy="24" r="9" fill="#f6d9a8" />
          <path d="M30 62 a20 20 0 0 1 40 0 Z" fill="#b9936b" />
          <rect x="47" y="34" width="6" height="8" fill="#b9936b" />
          <rect x="26" y="62" width="48" height="14" fill="#c9a27a" />
          <path
            d="M30 66 h4 v10 h-4 Z M40 66 h4 v10 h-4 Z M50 66 h4 v10 h-4 Z M60 66 h4 v10 h-4 Z"
            fill="#8a6446"
          />
          <path d="M12 76 q4 -26 8 0 Z M82 76 q4 -30 8 0 Z" fill="#3e5a3a" />
          <rect y="76" width="100" height="24" fill="#d9c49c" />
        </>
      );
    case "coast":
      return (
        <>
          <rect width="100" height="100" fill="#bfe0ea" />
          <circle cx="72" cy="26" r="12" fill="#f2b134" />
          <path d="M-5 100 L-5 30 Q12 34 22 48 Q34 62 46 70 L46 100 Z" fill="#a27e5b" />
          <rect x="8" y="44" width="8" height="7" fill="#fbfbf8" />
          <rect x="18" y="52" width="9" height="7" fill="#f6d9a8" />
          <rect x="10" y="58" width="8" height="7" fill="#fbfbf8" />
          <rect x="28" y="62" width="8" height="7" fill="#fbfbf8" />
          <rect x="0" y="66" width="100" height="34" fill="#2f6f8f" />
          <path d="M50 76 h26 M58 88 h30" stroke="#8fbfcb" strokeWidth="1.5" />
          <path d="M62 80 h14 l-2 3 h-10 Z" fill="#fbfbf8" />
        </>
      );
  }
}
