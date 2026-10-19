import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MAP_STYLES } from "@/config/map-styles";
import { PRINT_SIZES, formatPrice } from "@/config/products";
import { SAMPLE_TRIPS } from "@/config/trip-samples";
import { TripPrintPreview } from "@/components/trip/TripPrintPreview";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/styles/$styleId")({
  loader: ({ params }) => {
    const style = MAP_STYLES.find((s) => s.id === params.styleId);
    if (!style) throw notFound();
    return { style };
  },
  head: ({ loaderData }) => {
    if (!loaderData)
      return { meta: [{ title: "Style not found" }, { name: "robots", content: "noindex" }] };
    const t = `${loaderData.style.name} Trip Map | TripMyWay`;
    return {
      meta: [
        { title: t },
        { name: "description", content: loaderData.style.description },
        { property: "og:title", content: t },
        { property: "og:description", content: loaderData.style.description },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="p-20 text-center">
      That style doesn't exist.{" "}
      <Link to="/styles" className="underline">
        See all styles
      </Link>
    </div>
  ),
  component: StyleDetail,
});

const FROM = Math.min(...PRINT_SIZES.map((s) => formatPrice(s.id, 1)));

function StyleDetail() {
  const { style } = Route.useLoaderData();
  // The real print file of a sample trip, drawn in this style (browser only).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const sample = useMemo(
    () => ({ ...SAMPLE_TRIPS.find((t) => t.id === "italy")!.design, styleId: style.id }),
    [style.id],
  );
  return (
    <div className="mx-auto grid max-w-7xl gap-12 px-5 pt-12 md:px-10 lg:grid-cols-[6fr_5fr] lg:gap-20">
      <figure>
        <div className="rounded-[22px] bg-stage p-5 sm:p-10">
          {mounted ? (
            <TripPrintPreview design={sample} placeholders={false} />
          ) : (
            <div className="aspect-[3/4]" />
          )}
        </div>
        <figcaption className="mt-3 text-sm text-muted-foreground">
          A sample trip through Italy in {style.name}: the actual print file, drawn from map data.
        </figcaption>
      </figure>
      <div className="lg:pt-6">
        <Link
          to="/styles"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          All styles
        </Link>
        <h1 className="mt-6 text-5xl md:text-6xl">{style.name}</h1>
        <p className="mt-5 text-lg text-muted-foreground">{style.description}</p>
        <ul className="mt-8 divide-y divide-border border-y border-border">
          {style.details.map((d) => (
            <li key={d} className="py-3 text-sm">
              {d}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex gap-2" aria-label="Colours">
          {Object.entries(style.configuration)
            .filter(([k]) => ["background", "primaryRoad", "water", "park", "accent"].includes(k))
            .map(([k, v]) => (
              <span
                key={k}
                title={k}
                className="h-8 w-8 rounded-full border-2 border-border"
                style={{ background: v as string }}
              />
            ))}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          Prints from ${FROM}, {PRINT_SIZES[0]!.label} to{" "}
          {PRINT_SIZES[PRINT_SIZES.length - 1]!.label} in.
        </p>
        <Button asChild variant="editorial" size="xl" className="mt-6">
          <Link to="/create" search={{ style: style.id }}>
            Create a trip map in this style
          </Link>
        </Button>
      </div>
    </div>
  );
}
