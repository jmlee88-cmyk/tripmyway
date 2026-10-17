import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About | TripMyWay" },
      { name: "description", content: "We turn the places that matter into designed wall art, drawn from real geographic data." },
      { property: "og:title", content: "About | TripMyWay" },
      { property: "og:description", content: "Designed map art from real geographic data." },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div className="mx-auto max-w-3xl px-5 pt-16 md:px-10">
      <p className="eyebrow">About</p>
      <h1 className="mt-4 text-5xl leading-tight md:text-6xl">Your place. Your story. Your map.</h1>
      <div className="mt-10 space-y-6 text-lg leading-relaxed text-muted-foreground">
        <p>Some places hold more than streets. The apartment where it all began, the corner where you met, the town you'll always call home.</p>
        <p>TripMyWay turns those places into designed wall art. Every map is drawn from real geographic data — every road, river and park is where it really is — then composed with the care of a printed poster: considered typography, quiet palettes and generous margins.</p>
        <p>No generated guesswork, no clip-art cities. Just your place, beautifully set.</p>
      </div>
      <Button asChild variant="editorial" size="xl" className="mt-12"><Link to="/create">Create Your Map</Link></Button>
    </div>
  );
}
