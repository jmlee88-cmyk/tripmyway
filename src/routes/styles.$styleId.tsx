import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MAP_STYLES } from "@/config/map-styles";
import { DEFAULT_CUSTOMIZATION, PRINT_SIZES } from "@/config/products";
import { PosterPreview } from "@/components/poster/PosterPreview";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/styles/$styleId")({
  loader: ({ params }) => {
    const style = MAP_STYLES.find((s) => s.id === params.styleId);
    if (!style) throw notFound();
    return { style };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Style not found" }, { name: "robots", content: "noindex" }] };
    const t = `${loaderData.style.name} Map Print | TripMyWay`;
    return { meta: [{ title: t }, { name: "description", content: loaderData.style.description }, { property: "og:title", content: t }, { property: "og:description", content: loaderData.style.description }] };
  },
  notFoundComponent: () => <div className="p-20 text-center">That style doesn't exist. <Link to="/styles" className="underline">See all styles</Link></div>,
  component: StyleDetail,
});

function StyleDetail() {
  const { style } = Route.useLoaderData();
  return (
    <div className="mx-auto grid max-w-7xl gap-12 px-5 pt-12 md:px-10 lg:grid-cols-[6fr_5fr] lg:gap-20">
      <div className="bg-stage p-8 sm:p-16">
        <PosterPreview customization={{ ...DEFAULT_CUSTOMIZATION, styleId: style.id, markerStyle: "dot" }} className="w-full shadow-print-lg" />
      </div>
      <div className="lg:pt-10">
        <Link to="/styles" className="eyebrow hover:text-foreground">← All styles</Link>
        <p className="mt-8 font-display text-xl italic text-ochre">Style {style.number}</p>
        <h1 className="mt-1 text-5xl md:text-6xl">{style.name}</h1>
        <p className="mt-5 text-lg text-muted-foreground">{style.description}</p>
        <ul className="mt-8 divide-y divide-border border-y border-border">
          {style.details.map((d) => <li key={d} className="py-3 text-sm">{d}</li>)}
        </ul>
        <div className="mt-8 flex gap-2">
          {Object.entries(style.configuration).filter(([k]) => ["background", "primaryRoad", "water", "park", "accent"].includes(k)).map(([k, v]) => (
            <span key={k} title={k} className="h-8 w-8 border border-border" style={{ background: v as string }} />
          ))}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">From ${PRINT_SIZES[0]?.price} · {PRINT_SIZES.map((s) => s.label).join(" / ")} in</p>
        <Button asChild variant="editorial" size="xl" className="mt-6"><Link to="/create" search={{ style: style.id }}>Create in this style</Link></Button>
      </div>
    </div>
  );
}
