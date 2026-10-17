import { createFileRoute, Link } from "@tanstack/react-router";
import { MAP_STYLES } from "@/config/map-styles";
import { DemoMapArt } from "@/components/map/DemoMapArt";

export const Route = createFileRoute("/styles/")({
  head: () => ({
    meta: [
      { title: "Map Styles | TripMyWay" },
      { name: "description", content: "Five map art styles: Modern Minimal, Vintage, Midnight, Topographic and Architectural." },
      { property: "og:title", content: "Map Styles | TripMyWay" },
      { property: "og:description", content: "Explore five designed map styles for your personalized print." },
    ],
  }),
  component: StylesPage,
});

function StylesPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 pt-12 md:px-10">
      <p className="eyebrow">The collection</p>
      <h1 className="mt-3 text-5xl md:text-6xl">Choose your style.</h1>
      <div className="mt-14 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        {MAP_STYLES.map((s, i) => (
          <Link key={s.id} to="/styles/$styleId" params={{ styleId: s.id }} className="group">
            <div className="aspect-[4/5] overflow-hidden border border-border group-hover:border-foreground">
              <DemoMapArt config={s.configuration} seed={i + 3} className="h-full w-full transition-transform duration-700 group-hover:scale-[1.03]" />
            </div>
            <p className="mt-4 font-display italic text-ochre">{s.number}</p>
            <h2 className="text-3xl">{s.name}</h2>
            <p className="mt-1 text-muted-foreground">{s.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
