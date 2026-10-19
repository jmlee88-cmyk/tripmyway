import { HOME_MAPS } from "./home-maps";

/**
 * A trip too far apart for one map, shown as a set of two prints in trip
 * order: California, then Japan, with the ocean crossing marked between them
 * and a small whole-trip map on the second print. Natural Earth coastlines.
 */
const PAD = 18;

function Panel({
  map,
  start,
  title,
  line,
  names,
  inset,
}: {
  map: (typeof HOME_MAPS)["cal" | "jp"];
  start: number;
  title: string;
  line: string;
  names: Record<string, [number, number, "start" | "middle" | "end"]>;
  inset?: boolean;
}) {
  const route = map.pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  return (
    <svg viewBox={`0 0 ${map.w + PAD * 2} ${map.h + PAD * 2 + 92}`} className="w-full shadow-print">
      <rect width="100%" height="100%" fill="#ffffff" />
      <svg x={PAD} y={PAD} width={map.w} height={map.h} viewBox={`0 0 ${map.w} ${map.h}`}>
        <rect width={map.w} height={map.h} fill="var(--color-sea)" />
        <path d={map.d} fill="var(--color-land)" />
        <path
          d={route}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {map.pts.map((p, i) => {
          const [dx, dy, anchor] = names[p.label] ?? [14, 4, "start"];
          return (
            <g key={p.label}>
              <circle
                cx={p.x}
                cy={p.y}
                r={10}
                fill="var(--color-ink)"
                stroke="#fff"
                strokeWidth={2}
              />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight={700}
                fill="#fff"
                className="font-sans"
              >
                {start + i}
              </text>
              <text
                x={p.x + dx}
                y={p.y + dy}
                textAnchor={anchor}
                fontSize="12"
                fontWeight={600}
                fill="var(--color-ink)"
                className="font-sans"
              >
                {p.label}
              </text>
            </g>
          );
        })}
        {inset && (
          <g>
            <rect
              x="10"
              y="10"
              width="104"
              height="58"
              rx="4"
              fill="#ffffff"
              stroke="var(--color-ink)"
              strokeWidth="1"
            />
            <text
              x="18"
              y="24"
              fontSize="8.5"
              fontWeight={600}
              fill="var(--color-muted-foreground)"
              className="font-sans"
            >
              Whole trip
            </text>
            <path
              d="M24 46 Q62 30 102 46"
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
            <circle cx="24" cy="46" r="3.5" fill="var(--color-ink)" />
            <circle cx="102" cy="46" r="3.5" fill="var(--color-ink)" />
          </g>
        )}
      </svg>
      <text
        x="50%"
        y={map.h + PAD + 48}
        textAnchor="middle"
        fontSize="24"
        fontWeight={700}
        letterSpacing="-0.5"
        fill="var(--color-ink)"
        className="font-display"
      >
        {title}
      </text>
      <text
        x="50%"
        y={map.h + PAD + 72}
        textAnchor="middle"
        fontSize="11"
        fill="var(--color-muted-foreground)"
        className="font-sans"
      >
        {line}
      </text>
    </svg>
  );
}

export function SplitTripArt({ className = "" }: { className?: string }) {
  return (
    <figure
      className={className}
      aria-label="A set of two prints: California on the first, Japan on the second, with the Pacific Ocean crossing marked between them."
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
        <Panel
          map={HOME_MAPS.cal}
          start={1}
          title="California to Japan"
          line="Part 1 of 2, Los Angeles to San Francisco"
          names={{
            "San Francisco": [14, 4, "start"],
            "Santa Barbara": [-4, 26, "middle"],
            "Los Angeles": [0, 26, "middle"],
          }}
        />
        <div className="flex flex-col items-center gap-2 text-center">
          <svg viewBox="0 0 40 12" className="w-10 sm:w-14" aria-hidden>
            <path
              d="M2 6 H34 M28 1 L35 6 L28 11"
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="1.8"
              strokeDasharray="3 3"
            />
          </svg>
          <span className="max-w-[6rem] text-[0.7rem] font-semibold leading-tight sm:text-xs">
            Pacific Ocean, about 8,300 km
          </span>
        </div>
        <Panel
          map={HOME_MAPS.jp}
          start={4}
          title="California to Japan"
          line="Part 2 of 2, Tokyo to Osaka"
          names={{ Tokyo: [0, 26, "middle"], Kyoto: [12, -10, "start"], Osaka: [-14, 18, "end"] }}
          inset
        />
      </div>
    </figure>
  );
}
