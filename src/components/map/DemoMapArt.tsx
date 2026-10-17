import { useMemo } from "react";
import type { MapStyleConfig } from "@/types/product";

/**
 * Deterministic, illustrative SVG street pattern. Used for style thumbnails
 * and as a graceful fallback when the live map cannot render (no WebGL /
 * offline). It is NOT geographic and is never used for the final print.
 */
function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function DemoMapArt({ config, seed = 7, className }: { config: MapStyleConfig; seed?: number; className?: string }) {
  const paths = useMemo(() => {
    const r = rng(seed * 9973);
    const minor: string[] = [];
    for (let i = 0; i < 26; i++) {
      const y = i * 4 + r() * 3;
      minor.push(`M0 ${y} Q50 ${y + (r() - 0.5) * 8} 100 ${y + (r() - 0.5) * 6}`);
      const x = i * 4 + r() * 3;
      minor.push(`M${x} 0 Q${x + (r() - 0.5) * 8} 60 ${x + (r() - 0.5) * 6} 130`);
    }
    const secondary = Array.from({ length: 6 }, () => {
      const a = r() * 130;
      return `M0 ${a} C30 ${a + (r() - 0.5) * 40} 70 ${a + (r() - 0.5) * 40} 100 ${a + (r() - 0.5) * 30}`;
    });
    const primary = Array.from({ length: 3 }, () => {
      const a = r() * 100;
      return `M${a} 0 C${a + (r() - 0.5) * 50} 50 ${a + (r() - 0.5) * 50} 90 ${a + (r() - 0.5) * 40} 130`;
    });
    const river = `M-5 ${60 + r() * 20} C25 ${40 + r() * 40} 60 ${70 + r() * 30} 105 ${50 + r() * 30}`;
    return { minor, secondary, primary, river, park: { x: 10 + r() * 50, y: 10 + r() * 60 } };
  }, [seed]);

  return (
    <svg viewBox="0 0 100 130" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <rect width="100" height="130" fill={config.background} />
      <rect x={paths.park.x} y={paths.park.y} width="22" height="16" fill={config.park} />
      <path d={paths.river} stroke={config.water} strokeWidth="7" fill="none" />
      <g stroke={config.minorRoad} strokeWidth="0.25" fill="none">
        {paths.minor.map((d, i) => <path key={i} d={d} />)}
      </g>
      <g stroke={config.secondaryRoad} strokeWidth="0.6" fill="none">
        {paths.secondary.map((d, i) => <path key={i} d={d} />)}
      </g>
      <g stroke={config.primaryRoad} strokeWidth="1.1" fill="none">
        {paths.primary.map((d, i) => <path key={i} d={d} />)}
      </g>
    </svg>
  );
}
