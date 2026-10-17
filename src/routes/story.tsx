import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type { Customization, Location, PrintFormat, ZoomLevel } from "@/types/product";
import { STORY } from "@/config/story";
import {
  DEFAULT_CUSTOMIZATION,
  TITLE_MAX,
  defaultSubtitle,
  formatCoordinates,
} from "@/config/products";
import { readStory, saveStoryDraft, type StoryRecommendation } from "@/lib/story";
import { findPlace } from "@/lib/geocoding";
import { track } from "@/lib/analytics";
import { LocationSearch } from "@/components/editor/LocationSearch";
import { PosterPreview } from "@/components/poster/PosterPreview";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/story")({
  head: () => ({
    meta: [
      { title: "Tell Us Your Story | TripMyWay" },
      {
        name: "description",
        content:
          "Tell us the story behind your places and we'll suggest the print — or set of three — that tells it best.",
      },
      { property: "og:title", content: "Tell Us Your Story | TripMyWay" },
      {
        property: "og:description",
        content:
          "Tell us the story behind your places and we'll suggest the print that tells it best.",
      },
    ],
  }),
  component: StoryPage,
});

/** One suggested panel, as the customer refines it. */
interface Draft {
  query: string;
  countryCode: string;
  title: string;
  date: string;
  note: string;
  zoomLevel: ZoomLevel;
  location: Location | null;
  lookup: "pending" | "found" | "missing";
}

const ROMAN = ["I", "II", "III"];

function toCustomization(d: Draft): Customization {
  const l = d.location!;
  return {
    ...DEFAULT_CUSTOMIZATION,
    location: l,
    title: d.title.toUpperCase(),
    subtitle: defaultSubtitle(l),
    date: d.date,
    coordinates: formatCoordinates(l.latitude, l.longitude),
    zoomLevel: d.zoomLevel,
  };
}

function StoryPage() {
  const navigate = useNavigate();
  const [story, setStory] = useState("");
  const [status, setStatus] = useState<"idle" | "reading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [rec, setRec] = useState<StoryRecommendation | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [format, setFormat] = useState<PrintFormat>("single");
  const [single, setSingle] = useState(0);
  const run = useRef(0);

  const patch = (i: number, p: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)));

  const [answer, setAnswer] = useState("");

  async function read(text: string = story) {
    const id = ++run.current;
    setError(null);
    setStatus("reading");
    track("story_submitted", { length: text.trim().length });
    try {
      const res = await readStory({ data: { story: text } });
      if (id !== run.current) return;
      if (!res.ok) {
        setError(res.error);
        setStatus("idle");
        return;
      }
      const r = res.result;
      setRec(r);
      setFormat(r.format);
      setSingle(0);
      const next: Draft[] = r.panels.map((p) => ({
        query: p.place,
        countryCode: p.countryCode,
        title: p.title,
        date: p.date,
        note: p.note,
        zoomLevel: p.zoomLevel,
        location: null,
        lookup: "pending",
      }));
      setDrafts(next);
      setStatus("done");
      track("story_recommended", { format: r.format, places: r.panels.length });
      // Find each place on the map. Sequential, to be gentle on the geocoder.
      for (const [i, d] of next.entries()) {
        let found: Location | undefined;
        try {
          found = (await findPlace(d.query, d.zoomLevel, d.countryCode || undefined)) ?? undefined;
        } catch {
          /* falls through to "missing" */
        }
        if (id !== run.current) return;
        patch(i, found ? { location: found, lookup: "found" } : { lookup: "missing" });
      }
    } catch {
      setError("Something went wrong reading your story. Please try again.");
      setStatus("idle");
    }
  }

  const chosen = format === "triptych" ? drafts.slice(0, 3) : drafts.slice(single, single + 1);
  const ready = chosen.length > 0 && chosen.every((d) => d.location && d.title.trim());
  const canSet = drafts.length >= 3;

  function design() {
    if (!ready) return;
    saveStoryDraft({ format, panels: chosen.map(toCustomization) });
    track("story_to_editor", { format, followed: format === rec?.format });
    void navigate({ to: "/create", search: { from: "story" } });
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-10 md:px-10 md:pt-16">
      <div className="max-w-3xl">
        <p className="eyebrow">Tell us your story</p>
        <h1 className="mt-3 text-5xl leading-[1.04] md:text-6xl">Every map begins with a story.</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Tell us about the places that matter — where you met, where you grew up, where life
          happened. We'll suggest the print, or the set of three, that tells it best.
        </p>
      </div>

      <section className="mt-10 max-w-3xl" aria-label="Your story">
        <label htmlFor="story" className="eyebrow">
          Your story
        </label>
        <textarea
          id="story"
          value={story}
          onChange={(e) => setStory(e.target.value.slice(0, STORY.maxStoryLength))}
          rows={6}
          placeholder={STORY.placeholder}
          className="mt-2 w-full resize-y border-b border-foreground/25 bg-transparent py-3 font-display text-xl leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground md:text-2xl"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Try:</span>
            {STORY.examples.map((e, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStory(e)}
                className="border border-border px-3 py-1.5 text-xs tracking-wide transition-colors hover:border-foreground"
              >
                {["A wedding", "A journey", "A gift"][i]}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {story.length}/{STORY.maxStoryLength}
          </span>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-6">
          <Button
            variant="editorial"
            size="xl"
            onClick={() => void read()}
            disabled={status === "reading" || story.trim().length < STORY.minStoryLength}
          >
            {status === "reading"
              ? "Reading your story…"
              : status === "done"
                ? "Read it again"
                : "Suggest my print"}
          </Button>
          <Link
            to="/create"
            className="text-xs uppercase tracking-[0.2em] underline-offset-4 hover:underline"
          >
            Or design it yourself
          </Link>
        </div>
        {error && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          Your story is read by an AI model to suggest places, titles and dates. It isn't saved or
          used for anything else.
        </p>
      </section>

      {status === "done" && rec && (
        <section className="mt-16 border-t border-foreground pt-10 fade-in" aria-live="polite">
          {rec.followUp ? (
            <div className="max-w-2xl">
              <p className="eyebrow">One question</p>
              <p className="mt-3 font-display text-3xl">{rec.followUp}</p>
              <form
                className="mt-6 flex flex-wrap items-end gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const a = answer.trim();
                  if (!a) return;
                  // The answer becomes part of the story, so the next reading has it.
                  const next = `${story.trim()} ${a}`.slice(0, STORY.maxStoryLength);
                  setStory(next);
                  setAnswer("");
                  track("story_followup_answered");
                  void read(next);
                }}
              >
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Your answer</span>
                  <input
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    maxLength={200}
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
            <>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="max-w-2xl">
                  <p className="eyebrow">Our suggestion</p>
                  <h2 className="mt-3 text-4xl md:text-5xl">
                    {rec.format === "triptych" ? "A set of three" : "A single print"}
                  </h2>
                  {rec.reason && (
                    <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                      {rec.reason}
                    </p>
                  )}
                </div>
                {canSet && (
                  <div
                    role="radiogroup"
                    aria-label="Format"
                    className="inline-flex border border-border"
                  >
                    {(["triptych", "single"] as const).map((f) => (
                      <button
                        key={f}
                        role="radio"
                        aria-checked={format === f}
                        onClick={() => setFormat(f)}
                        className={`min-h-11 px-5 text-xs tracking-wide transition-colors ${format === f ? "bg-foreground text-background" : "hover:bg-accent"}`}
                      >
                        {f === "triptych" ? "Set of three" : "Single print"}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <ol
                className={`mt-10 grid gap-8 ${drafts.length >= 3 ? "md:grid-cols-3" : drafts.length === 2 ? "md:grid-cols-2" : "max-w-sm"}`}
              >
                {drafts.map((d, i) => {
                  const inPrint = format === "triptych" ? i < 3 : i === single;
                  return (
                    <li
                      key={i}
                      className={`transition-opacity ${inPrint ? "" : "opacity-45 hover:opacity-80"}`}
                    >
                      <div className="bg-stage p-5">
                        {d.location ? (
                          <PosterPreview
                            customization={toCustomization(d)}
                            className="w-full shadow-print"
                          />
                        ) : (
                          <div className="flex aspect-[3/4] items-center justify-center border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                            {d.lookup === "pending"
                              ? "Finding this place…"
                              : `We couldn't find "${d.query}". Search for it below.`}
                          </div>
                        )}
                      </div>
                      <div className="mt-4 flex items-baseline justify-between gap-3">
                        <span className="font-display text-sm italic text-ochre">
                          {format === "triptych" ? ROMAN[i] : ""}
                        </span>
                        {format === "single" && drafts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setSingle(i)}
                            aria-pressed={i === single}
                            className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground underline-offset-4 hover:underline aria-pressed:text-foreground aria-pressed:no-underline"
                          >
                            {i === single ? "Your print" : "Use this place"}
                          </button>
                        )}
                      </div>
                      <label className="mt-1 block">
                        <span className="sr-only">Title</span>
                        <input
                          value={d.title}
                          maxLength={TITLE_MAX}
                          onChange={(e) => patch(i, { title: e.target.value })}
                          className="w-full border-b border-transparent bg-transparent py-1 font-display text-2xl outline-none transition-colors hover:border-foreground/20 focus:border-foreground"
                        />
                      </label>
                      <label className="block">
                        <span className="sr-only">Date</span>
                        <input
                          value={d.date}
                          maxLength={30}
                          placeholder="Add a date"
                          onChange={(e) => patch(i, { date: e.target.value })}
                          className="w-full border-b border-transparent bg-transparent py-1 text-sm text-muted-foreground outline-none transition-colors hover:border-foreground/20 focus:border-foreground"
                        />
                      </label>
                      {d.note && (
                        <p className="mt-2 text-sm italic text-muted-foreground">{d.note}</p>
                      )}
                      <p
                        className="mt-3 truncate text-xs text-muted-foreground"
                        title={d.location?.formattedAddress}
                      >
                        {d.location ? d.location.formattedAddress : d.query}
                      </p>
                      <div className="mt-2">
                        <LocationSearch
                          compact
                          value={d.location}
                          placeholder={
                            d.location ? "Not quite right? Search again" : "Search for this place"
                          }
                          onSelect={(l) => patch(i, { location: l, lookup: "found" })}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="mt-12 flex flex-col items-start gap-3 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-md text-sm text-muted-foreground">
                  A starting point. Next you'll choose the style, size and layout, and can change
                  anything.
                </p>
                <Button variant="editorial" size="xl" onClick={design} disabled={!ready}>
                  {format === "triptych" ? "Design my set" : "Design my print"}
                </Button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
