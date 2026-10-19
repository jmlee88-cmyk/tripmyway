import { HOME_MAPS } from "./home-maps";
import { type VignetteKind, VignetteArt } from "./Vignette";

/**
 * The home page's sample trip print (layout B): a real map of Italy (Natural
 * Earth coastlines), the route in travel order, numbered stops and a photo
 * beside five of them. On load the route draws itself, then the stops appear.
 */
const M = HOME_MAPS.italy;
// Where each photo sits (map units) and what it shows; stops without one get just their name.
const PHOTOS: Record<string, { x: number; y: number; kind: VignetteKind }> = {
  "Lake Como": { x: 66, y: 58, kind: "lake" },
  Venice: { x: 452, y: 84, kind: "canal" },
  "Cinque Terre": { x: 92, y: 300, kind: "cliff" },
  Rome: { x: 218, y: 448, kind: "city" },
  Amalfi: { x: 528, y: 382, kind: "coast" },
};
const NAME_SIDE: Record<string, "left" | "right"> = { Milan: "right", Florence: "right" };
const R = 44;
const PAD = 30;

export function TripPosterArt({
  animate = true,
  className = "",
}: {
  animate?: boolean;
  className?: string;
}) {
  const route = M.pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const anim = (delay: number) =>
    animate ? { animation: `pin-drop 0.45s ${delay}s cubic-bezier(.2,.8,.3,1.2) both` } : undefined;
  return (
    <svg
      viewBox={`0 0 ${M.w + PAD * 2} ${M.h + PAD * 2 + 170}`}
      role="img"
      aria-label="A sample trip print of Italy: seven stops from Milan to Amalfi joined by a route, with a photo beside five of them, titled Italy 2026."
      className={className}
    >
      <rect width="100%" height="100%" fill="#ffffff" />
      <svg x={PAD} y={PAD} width={M.w} height={M.h} viewBox={`0 0 ${M.w} ${M.h}`}>
        <rect width={M.w} height={M.h} fill="var(--color-sea)" />
        <path d={M.d} fill="var(--color-land)" />
        <path
          d={route}
          pathLength={1}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="route-anim"
          style={
            animate
              ? {
                  strokeDasharray: 1,
                  ["--route-len" as string]: 1,
                  animation: "route-draw 1.6s 0.2s ease-in-out both",
                }
              : undefined
          }
        />
        {M.pts.map((p, i) => {
          const ph = PHOTOS[p.label];
          const delay = 0.5 + i * 0.18;
          if (!ph) {
            const side = NAME_SIDE[p.label] ?? "right";
            return (
              <text
                key={p.label}
                x={p.x + (side === "left" ? -18 : 18)}
                y={p.y + 5}
                textAnchor={side === "left" ? "end" : "start"}
                className="pin-anim font-sans"
                style={anim(delay + 0.2)}
                fontSize="15"
                fontWeight={600}
                fill="var(--color-ink)"
              >
                {p.label}
              </text>
            );
          }
          // Leader from the marker to the circle's edge.
          const dx = ph.x - p.x;
          const dy = ph.y - p.y;
          const len = Math.hypot(dx, dy);
          const ex = ph.x - (dx / len) * R;
          const ey = ph.y - (dy / len) * R;
          return (
            <g key={p.label} className="pin-anim" style={anim(delay + 0.2)}>
              <line
                x1={p.x}
                y1={p.y}
                x2={ex}
                y2={ey}
                stroke="var(--color-ink)"
                strokeWidth={2}
                strokeDasharray="0.1 5"
                strokeLinecap="round"
              />
              <clipPath id={`ph-${i}`}>
                <circle cx={ph.x} cy={ph.y} r={R} />
              </clipPath>
              <g clipPath={`url(#ph-${i})`}>
                <svg
                  x={ph.x - R}
                  y={ph.y - R}
                  width={R * 2}
                  height={R * 2}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="xMidYMid slice"
                >
                  <VignetteArt kind={ph.kind} />
                </svg>
              </g>
              <circle cx={ph.x} cy={ph.y} r={R - 2} fill="none" stroke="#ffffff" strokeWidth={4} />
              <text
                x={ph.x}
                y={ph.y + R + 20}
                textAnchor="middle"
                className="font-sans"
                fontSize="15"
                fontWeight={600}
                fill="var(--color-ink)"
              >
                {p.label}
              </text>
            </g>
          );
        })}
        {M.pts.map((p, i) => (
          <g key={`m-${p.label}`} className="pin-anim" style={anim(0.5 + i * 0.18)}>
            <circle
              cx={p.x}
              cy={p.y}
              r={12}
              fill="var(--color-ink)"
              stroke="#ffffff"
              strokeWidth={2.5}
            />
            <text
              x={p.x}
              y={p.y + 4.5}
              textAnchor="middle"
              fontSize="13"
              fontWeight={700}
              fill="#ffffff"
              className="font-sans"
            >
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      <text
        x="50%"
        y={M.h + PAD + 88}
        textAnchor="middle"
        className="font-display"
        fontSize="50"
        fontWeight={700}
        letterSpacing="-1"
        fill="var(--color-ink)"
      >
        Italy 2026
      </text>
      <text
        x="50%"
        y={M.h + PAD + 126}
        textAnchor="middle"
        className="font-sans"
        fontSize="17"
        fill="var(--color-muted-foreground)"
      >
        Milan to Amalfi, 7 stops, June 3 to 18
      </text>
    </svg>
  );
}
