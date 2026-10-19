import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About | TripMyWay" },
      {
        name: "description",
        content:
          "TripMyWay puts every stop of your trip on one print: a real map, your route and your photos.",
      },
      { property: "og:title", content: "About | TripMyWay" },
      { property: "og:description", content: "Every stop of your trip on one print." },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div className="mx-auto max-w-3xl px-5 pt-16 md:px-10">
      <h1 className="text-5xl leading-tight md:text-6xl">Trips are made of stops.</h1>
      <div className="mt-10 space-y-6 text-lg leading-relaxed text-muted-foreground">
        <p>
          The first night in a new city, the town you only meant to pass through, the view at the
          end of the long drive. A trip is the line that joins them, and the photos you took along
          the way.
        </p>
        <p>
          TripMyWay puts that on one print: every stop in order on a real map, the route between
          them, and your photo beside each one. Maps are drawn from OpenStreetMap data, so every
          coastline and town is where it really is.
        </p>
        <p>
          When a trip is too big for one map, it becomes a set of two or three prints that hang
          together, so the whole journey still reads in order.
        </p>
      </div>
      <Button asChild variant="editorial" size="xl" className="mt-12">
        <Link to="/create">Start your trip map</Link>
      </Button>
    </div>
  );
}
