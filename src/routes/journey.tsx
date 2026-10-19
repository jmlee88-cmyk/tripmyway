import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type { Location } from "@/types/product";
import { JOURNEY } from "@/config/journey";
import { readJourney, type JourneyReading } from "@/lib/journey";
import { findPlace } from "@/lib/geocoding";
import { track } from "@/lib/analytics";
import { TripEditor, type StopDraft } from "@/components/trip/TripEditor";
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

function JourneyPage() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "reading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<JourneyReading | null>(null);
  const [answer, setAnswer] = useState("");
  const [title, setTitle] = useState("");
  const [drafts, setDrafts] = useState<StopDraft[]>([]);
  const run = useRef(0);

  const patch = (i: number, p: Partial<StopDraft>) =>
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
      const next: StopDraft[] = r.stops.map((s, i) => ({
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

  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-10 md:px-10 md:pt-14">
      <div className="max-w-3xl">
        <h1 className="text-5xl leading-[1] md:text-6xl">Map Your Journey</h1>
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
            className="mt-2 w-full resize-y rounded-2xl border-2 border-border bg-card p-5 text-lg leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground"
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
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-pin" />
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
            <figure
              key={ex.id}
              className="flex min-w-0 flex-col rounded-2xl border-2 border-border bg-card p-5"
            >
              <figcaption className="font-display text-2xl font-bold">{ex.label}</figcaption>
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
                className="mt-5 self-start text-sm font-semibold underline decoration-pin decoration-2 underline-offset-4"
              >
                Use this example
              </button>
            </figure>
          ))}
        </div>
      </section>

      {status === "done" && reading && (
        <section className="mt-16 border-t-2 border-border pt-10 fade-in" aria-live="polite">
          {reading.followUp ? (
            <div className="max-w-2xl">
              <p className="eyebrow">One question</p>
              <p className="mt-3 font-display text-3xl font-bold">{reading.followUp}</p>
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
                    className="w-full rounded-xl border-2 border-border bg-card px-4 py-2.5 text-lg outline-none focus:border-foreground"
                  />
                </label>
                <Button type="submit" variant="editorial" size="lg" disabled={!answer.trim()}>
                  Continue
                </Button>
              </form>
            </div>
          ) : (
            <TripEditor
              stops={drafts}
              setStops={setDrafts}
              title={title}
              setTitle={setTitle}
              notice={
                reading.merged ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    You visited one place more than once; it's marked once on the map.
                  </p>
                ) : undefined
              }
            />
          )}
        </section>
      )}
    </div>
  );
}
