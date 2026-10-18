import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import type { Location, PrintSizeId } from "@/types/product";
import type { TripDesign, TripPhoto, TripStop } from "@/types/trip";
import { JOURNEY } from "@/config/journey";
import { DEFAULT_STYLE_ID } from "@/config/map-styles";
import { PRINT_SIZES, TITLE_MAX, getPrintSize } from "@/config/products";
import { TRIP_LAYOUT, cqwToIn } from "@/components/poster/poster-layout";
import { readJourney, type JourneyReading } from "@/lib/journey";
import { findPlace } from "@/lib/geocoding";
import { plansBySize } from "@/lib/trip/plan";
import { formatKm } from "@/print/render-trip-pdf";
import { track } from "@/lib/analytics";
import { LocationSearch } from "@/components/editor/LocationSearch";
import { TripPrintPreview } from "@/components/trip/TripPrintPreview";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/journey")({
  head: () => ({
    meta: [
      { title: "Map Your Journey | TripMyWay" },
      {
        name: "description",
        content:
          "Paste your itinerary or tell us about your trip, and we'll map every stop in order on one print, with a place for a photo at each stop.",
      },
      { property: "og:title", content: "Map Your Journey | TripMyWay" },
      {
        property: "og:description",
        content: "Paste your itinerary and we'll map every stop of your trip on one print.",
      },
    ],
  }),
  component: JourneyPage,
});

/** One stop as the customer confirms it. */
interface Draft {
  id: string;
  query: string;
  countryCode: string;
  label: string;
  date: string;
  location: Location | null;
  lookup: "pending" | "found" | "missing";
  photo?: TripPhoto;
}

function JourneyPage() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "reading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<JourneyReading | null>(null);
  const [answer, setAnswer] = useState("");
  const [title, setTitle] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [printSize, setPrintSize] = useState<PrintSizeId>("18x24");
  const [stripPrints, setStripPrints] = useState<number[]>([]);
  const run = useRef(0);

  const patch = (i: number, p: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)));

  async function read(input: string = text) {
    const id = ++run.current;
    setError(null);
    setStatus("reading");
    track("journey_submitted", { length: input.trim().length });
    try {
      const res = await readJourney({ data: { text: input } });
      if (id !== run.current) return;
      if (!res.ok) {
        setError(res.error);
        setStatus("idle");
        return;
      }
      const r = res.result;
      setReading(r);
      setTitle(r.title);
      const next: Draft[] = r.stops.map((s, i) => ({
        id: `${i}-${s.label}`,
        query: s.place,
        countryCode: s.countryCode,
        label: s.label,
        date: s.date,
        location: null,
        lookup: "pending",
      }));
      setDrafts(next);
      setStatus("done");
      track("journey_read", { stops: r.stops.length, asked: Boolean(r.followUp) });
      // Find each stop on the map. One at a time, to be gentle on the geocoder.
      for (const [i, d] of next.entries()) {
        let found: Location | undefined;
        try {
          found = (await findPlace(d.query, "city", d.countryCode || undefined)) ?? undefined;
        } catch {
          /* falls through to "missing" */
        }
        if (id !== run.current) return;
        patch(i, found ? { location: found, lookup: "found" } : { lookup: "missing" });
      }
    } catch {
      setError("Something went wrong reading your trip. Please try again.");
      setStatus("idle");
    }
  }

  async function addPhoto(i: number, file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => undefined);
    patch(i, {
      photo: {
        key: `${file.name}:${file.size}:${file.lastModified}`,
        url,
        widthPx: img.naturalWidth,
        heightPx: img.naturalHeight,
      },
    });
    track("journey_photo_added");
  }

  const allFound = drafts.length > 0 && drafts.every((d) => d.location);
  const design: TripDesign | null = useMemo(() => {
    if (!allFound) return null;
    return {
      title: title.trim() || "My Journey",
      styleId: DEFAULT_STYLE_ID,
      printSize,
      stops: drafts.map((d): TripStop => ({
        id: d.id,
        label: d.label.trim() || d.location!.name,
        location: d.location!,
        ...(d.date.trim() ? { date: d.date.trim() } : {}),
        ...(d.photo ? { photo: d.photo } : {}),
      })),
    };
  }, [allFound, drafts, title, printSize]);

  const bySize = useMemo(
    () =>
      design
        ? plansBySize(
            design.stops.map((s) => ({ lng: s.location.longitude, lat: s.location.latitude })),
            PRINT_SIZES,
            design.styleId,
          )
        : null,
    [design],
  );
  const plan = bySize?.find((b) => b.size.id === printSize)?.plan;
  const singleFrom = bySize?.find((b) => b.plan.panels.length === 1 && b.plan.fits)?.size;
  const size = getPrintSize(printSize);
  const photoNeedPx = Math.round(cqwToIn(TRIP_LAYOUT.photo.diameter, size.widthIn) * 150);

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-10 md:px-10 md:pt-16">
      <div className="max-w-3xl">
        <p className="eyebrow">Map your journey</p>
        <h1 className="mt-3 text-5xl leading-[1.04] md:text-6xl">Every trip, mapped in order.</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Paste your itinerary or tell us about your trip. We'll find every stop, map your route
          from start to finish, and save a spot beside each one for a photo.
        </p>
      </div>

      <section
        className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]"
        aria-label="Your trip"
      >
        <div className="min-w-0">
          <label htmlFor="journey" className="eyebrow">
            Your trip
          </label>
          <textarea
            id="journey"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, JOURNEY.maxLength))}
            rows={8}
            placeholder={JOURNEY.placeholder}
            className="mt-2 w-full resize-y border-b border-foreground/25 bg-transparent py-3 font-display text-xl leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground md:text-2xl"
          />
          <p className="mt-2 text-right text-[11px] text-muted-foreground">
            {text.length}/{JOURNEY.maxLength}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-6">
            <Button
              variant="editorial"
              size="xl"
              onClick={() => void read()}
              disabled={status === "reading" || text.trim().length < JOURNEY.minLength}
            >
              {status === "reading"
                ? "Reading your trip…"
                : status === "done"
                  ? "Read it again"
                  : "Map my journey"}
            </Button>
          </div>
          {error && (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            Your trip is read by an AI model to find the places and dates. It isn't saved or used
            for anything else.
          </p>
        </div>

        <aside className="min-w-0 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <p className="eyebrow">How to write it</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
            {JOURNEY.tips.map((t) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden className="text-ochre">
                  ·
                </span>
                {t}
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="mt-12" aria-labelledby="examples-heading">
        <h2 id="examples-heading" className="eyebrow">
          Three ways that work
        </h2>
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          {JOURNEY.examples.map((ex) => (
            <figure key={ex.id} className="flex min-w-0 flex-col border border-border p-5">
              <figcaption className="font-display text-2xl">{ex.label}</figcaption>
              <p className="mt-1 text-xs text-muted-foreground">{ex.tip}</p>
              <pre className="mt-4 flex-1 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
                {ex.text}
              </pre>
              <button
                type="button"
                onClick={() => {
                  setText(ex.text);
                  track("journey_example_used", { example: ex.id });
                }}
                className="mt-5 self-start text-xs uppercase tracking-[0.2em] underline-offset-4 hover:underline"
              >
                Use this example
              </button>
            </figure>
          ))}
        </div>
      </section>

      {status === "done" && reading && (
        <section className="mt-16 border-t border-foreground pt-10 fade-in" aria-live="polite">
          {reading.followUp ? (
            <div className="max-w-2xl">
              <p className="eyebrow">One question</p>
              <p className="mt-3 font-display text-3xl">{reading.followUp}</p>
              <form
                className="mt-6 flex flex-wrap items-end gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const a = answer.trim();
                  if (!a) return;
                  // The answer becomes part of the trip, so the next reading has it.
                  const next = `${text.trim()}\n${a}`.slice(0, JOURNEY.maxLength);
                  setText(next);
                  setAnswer("");
                  track("journey_followup_answered");
                  void read(next);
                }}
              >
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Your answer</span>
                  <input
                    id="journey-answer"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    maxLength={300}
                    placeholder="Your answer"
                    className="w-full border-b border-foreground/25 bg-transparent py-2.5 text-lg outline-none focus:border-foreground"
                  />
                </label>
                <Button type="submit" variant="editorial" size="lg" disabled={!answer.trim()}>
                  Continue
                </Button>
              </form>
            </div>
          ) : (
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
              <div className="min-w-0">
                <p className="eyebrow">Your stops</p>
                <label className="mt-3 block">
                  <span className="sr-only">Print title</span>
                  <input
                    id="journey-title"
                    value={title}
                    maxLength={TITLE_MAX}
                    placeholder="Name your trip"
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full border-b border-transparent bg-transparent py-1 font-display text-4xl outline-none transition-colors hover:border-foreground/20 focus:border-foreground md:text-5xl"
                  />
                </label>
                {reading.merged && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    You visited one place more than once; it's marked once on the map.
                  </p>
                )}

                <ol className="mt-8 flex flex-col divide-y divide-border border-y border-border">
                  {drafts.map((d, i) => {
                    const small =
                      d.photo && Math.min(d.photo.widthPx, d.photo.heightPx) < photoNeedPx;
                    return (
                      <li key={d.id} className="flex gap-4 py-5">
                        <span
                          aria-hidden
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground font-mono text-xs text-background"
                        >
                          {i + 1}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                            <label className="min-w-0 flex-1">
                              <span className="sr-only">Stop {i + 1} name</span>
                              <input
                                id={`stop-${i}-label`}
                                value={d.label}
                                maxLength={JOURNEY.labelMax}
                                onChange={(e) => patch(i, { label: e.target.value })}
                                className="w-full border-b border-transparent bg-transparent py-0.5 font-display text-2xl outline-none transition-colors hover:border-foreground/20 focus:border-foreground"
                              />
                            </label>
                            <label>
                              <span className="sr-only">Stop {i + 1} date</span>
                              <input
                                id={`stop-${i}-date`}
                                value={d.date}
                                maxLength={20}
                                placeholder="Add a date"
                                onChange={(e) => patch(i, { date: e.target.value })}
                                className="w-32 border-b border-transparent bg-transparent py-0.5 text-sm text-muted-foreground outline-none transition-colors hover:border-foreground/20 focus:border-foreground"
                              />
                            </label>
                          </div>
                          <p
                            className="truncate text-xs text-muted-foreground"
                            title={d.location?.formattedAddress}
                          >
                            {d.lookup === "pending"
                              ? "Finding this place…"
                              : d.location
                                ? d.location.formattedAddress
                                : `We couldn't find "${d.query}". Search for it below.`}
                          </p>
                          {d.lookup !== "pending" && (
                            <LocationSearch
                              compact
                              value={d.location}
                              placeholder={
                                d.location ? "Wrong place? Search again" : "Search for this place"
                              }
                              onSelect={(l) => patch(i, { location: l, lookup: "found" })}
                            />
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                            {d.photo && (
                              <img
                                src={d.photo.url}
                                alt=""
                                className="h-10 w-10 rounded-full object-cover"
                              />
                            )}
                            <label className="cursor-pointer underline underline-offset-4">
                              {d.photo ? "Change photo" : "Add a photo"}
                              <input
                                type="file"
                                accept="image/jpeg,image/png"
                                className="sr-only"
                                onChange={(e) => void addPhoto(i, e.target.files?.[0])}
                              />
                            </label>
                            {small && (
                              <span className="text-destructive">
                                This photo is small for {size.label}; it may print soft.
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <p className="eyebrow">Your print</p>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Size</span>
                    <select
                      id="journey-size"
                      value={printSize}
                      onChange={(e) => setPrintSize(e.target.value as PrintSizeId)}
                      className="h-10 border border-border bg-background px-2 text-sm"
                    >
                      {PRINT_SIZES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label} in
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {plan && (
                  <div className="mt-4 text-sm leading-relaxed">
                    {plan.panels.length === 1 ? (
                      <p>Your whole trip fits on one {size.label} print.</p>
                    ) : (
                      <p>
                        Your trip covers a lot of ground, so it's mapped across {plan.panels.length}{" "}
                        prints that hang together
                        {plan.breaks.length > 0 && (
                          <>
                            , split at{" "}
                            {plan.breaks
                              .map(
                                (b) =>
                                  `${drafts[b.after]!.label} to ${drafts[b.after + 1]!.label} (about ${formatKm(b.km)} km)`,
                              )
                              .join(" and ")}
                          </>
                        )}
                        . A small map of the whole route ties them together.
                      </p>
                    )}
                    {plan.panels.length > 1 && singleFrom && (
                      <p className="mt-2 text-muted-foreground">
                        Prefer one print? It fits on one from {singleFrom.label} in up.
                      </p>
                    )}
                    {stripPrints.length > 0 && (
                      <p className="mt-2 text-muted-foreground">
                        Some stops are close together, so on{" "}
                        {stripPrints.length > 1 ? "those prints" : "that print"} the photos will sit
                        in a row below the map.
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-6">
                  {design ? (
                    <TripPrintPreview
                      design={design}
                      onRendered={(r) =>
                        setStripPrints(
                          r.placements.flatMap((p, i) => (p.mode === "strip" ? [i + 1] : [])),
                        )
                      }
                    />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      {drafts.some((d) => d.lookup === "pending")
                        ? "Finding your stops on the map…"
                        : "Fix the stops we couldn't find, and your map appears here."}
                    </div>
                  )}
                </div>
                <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
                  Ordering trip prints opens soon. Until then you can shape your map here, or{" "}
                  <Link to="/create" className="underline underline-offset-4">
                    design a single-place map
                  </Link>
                  .
                </p>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
