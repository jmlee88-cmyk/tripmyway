import { createFileRoute, Link } from "@tanstack/react-router";
import { MAP_STYLES } from "@/config/map-styles";
import { DemoMapArt } from "@/components/map/DemoMapArt";

export const Route = createFileRoute("/styles/")({
  head: () => ({
    meta: [
      { title: "Map Styles | TripMyWay" },
      {
        name: "description",
        content:
          "Five styles for your trip map: Modern Minimal, Vintage, Midnight, Topographic and Architectural.",
      },
      { property: "og:title", content: "Map Styles | TripMyWay" },
      { property: "og:description", content: "Five styles for your trip map print." },
    ],
  }),
  component: StylesPage,
});

// An illustrative route over each style's pattern (the real maps are drawn from map data).
const ROUTE = [
  [22, 96],
  [38, 66],
  [63, 78],
  [78, 38],
] as const;

function StylesPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 pt-12 md:px-10">
      <h1 className="text-5xl md:text-6xl">Map styles</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        Every trip map comes in five styles. Each shows the real roads, water and parks of your
        trip; only the colours and lettering change.
      </p>
      <div className="mt-12 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        {MAP_STYLES.map((s, i) => {
          const c = s.configuration;
          return (
            <Link key={s.id} to="/styles/$styleId" params={{ styleId: s.id }} className="group">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border-2 border-border transition-colors group-hover:border-foreground">
                <DemoMapArt config={c} seed={i + 3} className="h-full w-full" />
                <svg viewBox="0 0 100 125" className="absolute inset-0 h-full w-full" aria-hidden>
                  <polyline
                    points={ROUTE.map((p) => p.join(",")).join(" ")}
                    fill="none"
                    stroke={c.accent}
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                  {ROUTE.map(([x, y], k) => (
                    <g key={k}>
                      <circle
                        cx={x}
                        cy={y}
                        r="3.6"
                        fill={c.accent}
                        stroke={c.background}
                        strokeWidth="0.8"
                      />
                      <text
                        x={x}
                        y={y + 1.3}
                        textAnchor="middle"
                        fontSize="3.6"
                        fontWeight="700"
                        fill={c.background}
                      >
                        {k + 1}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
              <h2 className="mt-4 text-3xl">{s.name}</h2>
              <p className="mt-1 text-muted-foreground">{s.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
