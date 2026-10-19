import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MAP_STYLES } from "@/config/map-styles";
import { TRIP } from "@/config/trip";
import { TripEditor, type StopDraft } from "@/components/trip/TripEditor";

export const Route = createFileRoute("/create")({
  validateSearch: (s: Record<string, unknown>): { style?: string } =>
    typeof s["style"] === "string" ? { style: s["style"] } : {},
  head: () => ({
    meta: [
      { title: "Create Your Trip Map | TripMyWay" },
      {
        name: "description",
        content:
          "Add the places you went, in order, with a photo for each stop. See your trip print take shape on a real map as you go.",
      },
      { property: "og:title", content: "Create Your Trip Map | TripMyWay" },
      {
        property: "og:description",
        content: "Add your stops and photos and watch your trip print take shape.",
      },
    ],
  }),
  component: CreatePage,
});

/** The trip in progress is kept in this browser, so a reload doesn't lose it. */
const DRAFT_KEY = "tripmyway-trip-draft-v1";

function readDraft(): { stops: StopDraft[]; title: string } | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as {
      stops?: StopDraft[];
      title?: string;
    } | null;
    if (!d || !Array.isArray(d.stops)) return null;
    // Only stops that were found on the map come back.
    const stops = d.stops.filter((s) => s.location).slice(0, TRIP.maxStops);
    return { stops, title: typeof d.title === "string" ? d.title : "" };
  } catch {
    return null;
  }
}

function CreatePage() {
  const { style } = Route.useSearch();
  const styleId = style && MAP_STYLES.some((s) => s.id === style) ? style : undefined;
  const [stops, setStops] = useState<StopDraft[]>([]);
  const [title, setTitle] = useState("");
  // Saving starts only after the stored draft has been read back (and rendered).
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const d = readDraft();
    if (d) {
      setStops(d.stops);
      setTitle(d.title);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ stops, title }));
    } catch {
      /* storage unavailable: the draft just isn't kept */
    }
  }, [ready, stops, title]);

  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-10 md:px-10 md:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div className="max-w-2xl">
          <h1 className="text-5xl leading-[1] md:text-6xl">Create your trip map</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Add the places you went, in the order you went, up to {TRIP.maxStops}. Give each stop a
            photo, and your print takes shape beside them.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Have an itinerary?{" "}
          <Link
            to="/journey"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            Paste it instead
          </Link>
        </p>
      </div>
      <div className="mt-10">
        <TripEditor
          stops={stops}
          setStops={setStops}
          title={title}
          setTitle={setTitle}
          {...(styleId ? { styleId } : {})}
        />
      </div>
    </div>
  );
}
