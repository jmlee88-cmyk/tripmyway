import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PRINT_FINISHES, PRINT_SIZES, formatPrice } from "@/config/products";
import { TRIP } from "@/config/trip";
import { TPin } from "@/components/site/Logo";
import { TripPosterArt } from "@/components/home/TripPosterArt";
import { SplitTripArt } from "@/components/home/SplitTripArt";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TripMyWay | Your whole trip on one map print, with your photos" },
      {
        name: "description",
        content:
          "Turn a trip into wall art: add the places you went, in order, and we map the route on a real map with your photo beside every stop.",
      },
      { property: "og:title", content: "TripMyWay | Your whole trip on one print" },
      {
        property: "og:description",
        content: "Add the places you went. We map the route and put your photo beside every stop.",
      },
    ],
  }),
  component: Home,
});

const FROM = Math.min(...PRINT_SIZES.map((s) => formatPrice(s.id, 1)));

const STEPS = [
  ["Add your stops", "Search each place you went and put them in order. Up to seven."],
  [
    "Add a photo to each",
    "Pick the shot that says the most about each stop and choose what shows in the circle.",
  ],
  [
    "Choose size and finish",
    "From 8 × 10 to 32 × 48, on paper, canvas, metal or acrylic. Framed if you like.",
  ],
  [
    "We print it",
    "Your map is drawn from real map data and printed at full resolution, ready for the wall.",
  ],
] as const;

function Home() {
  return (
    <>
      {/* The hero opens with the product: a real trip, mapped. */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pt-10 md:px-10 md:pt-14 lg:grid-cols-[1fr_minmax(0,540px)] lg:gap-16">
        <div>
          <h1 className="text-[2.9rem] leading-[0.98] sm:text-6xl lg:text-[4.6rem]">
            Every stop of your trip, on one print.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground md:text-xl">
            Add the places you went, in the order you went. We draw the route on a real map and put
            your photo beside each stop.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild variant="editorial" size="xl">
              <Link to="/create">Start your trip map</Link>
            </Button>
            <Button asChild variant="editorial-outline" size="xl">
              <Link to="/journey">Paste your itinerary</Link>
            </Button>
          </div>
          <ul className="mt-9 flex flex-wrap gap-x-7 gap-y-3 text-sm font-medium">
            {[`Up to ${TRIP.maxStops} stops`, "A photo at every stop", `Prints from $${FROM}`].map(
              (t) => (
                <li key={t} className="flex items-center gap-2">
                  <TPin className="h-4 w-auto" />
                  {t}
                </li>
              ),
            )}
          </ul>
        </div>
        <div className="rounded-[28px] bg-stage p-6 sm:p-10">
          <TripPosterArt className="mx-auto w-full max-w-[460px] shadow-print-lg" />
        </div>
      </section>

      {/* Two ways in, matching how people plan. */}
      <section className="mx-auto mt-28 max-w-7xl px-5 md:px-10">
        <h2 className="max-w-2xl text-4xl md:text-5xl">Start the way you plan.</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Link
            to="/create"
            className="group flex flex-col rounded-[22px] border-2 border-border bg-card p-7 transition-colors hover:border-foreground md:p-9"
          >
            <ol className="flex flex-col gap-2.5" aria-hidden>
              {["Lisbon", "Sintra", "Porto", "Douro Valley"].map((s, i) => (
                <li key={s} className="flex items-center gap-3 rounded-xl bg-muted px-4 py-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="font-medium">{s}</span>
                </li>
              ))}
              <li className="flex items-center gap-3 rounded-xl border-2 border-dashed border-border px-4 py-3 text-muted-foreground">
                <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-dashed border-border text-sm">
                  +
                </span>
                Add a stop
              </li>
            </ol>
            <h3 className="mt-8 text-3xl">Build it stop by stop</h3>
            <p className="mt-2 max-w-md text-muted-foreground">
              Search for each place, put them in order and add your photos as you go.
            </p>
            <span className="mt-6 font-semibold underline decoration-pin decoration-[3px] underline-offset-[6px]">
              Start your trip map
            </span>
          </Link>
          <Link
            to="/journey"
            className="group flex flex-col rounded-[22px] bg-ink p-7 text-[#fbfbf8] md:p-9"
          >
            <pre
              aria-hidden
              className="whitespace-pre-wrap rounded-xl bg-white/8 px-5 py-4 font-sans text-[0.95rem] leading-7 text-[#fbfbf8]/85"
            >
              {
                "June 3: fly into Lisbon\nJune 6: day trip to Sintra\nJune 8: train to Porto\nJune 11: Douro Valley wine tour"
              }
            </pre>
            <h3 className="mt-8 text-3xl">Paste your itinerary</h3>
            <p className="mt-2 max-w-md text-[#fbfbf8]/75">
              Drop in your plans, a list of places or a few sentences about the trip. We find every
              stop and ask if anything is unclear.
            </p>
            <span className="mt-6 font-semibold underline decoration-pin decoration-[3px] underline-offset-[6px]">
              Map Your Journey
            </span>
          </Link>
        </div>
      </section>

      {/* A real sequence, drawn as a route with stops. */}
      <section className="mx-auto mt-28 max-w-7xl px-5 md:px-10">
        <h2 className="max-w-2xl text-4xl md:text-5xl">From trip to wall in four stops.</h2>
        <ol className="relative mt-12 grid gap-10 md:grid-cols-4 md:gap-8">
          <span
            aria-hidden
            className="absolute left-[18px] top-4 bottom-4 border-l-2 border-dashed border-foreground/30 md:left-4 md:right-[24%] md:top-[18px] md:bottom-auto md:border-l-0 md:border-t-2"
          />
          {STEPS.map(([t, d], i) => (
            <li key={t} className="relative pl-14 md:pl-0">
              <span className="absolute left-0 top-0 grid h-9 w-9 place-items-center rounded-full bg-pin font-display text-lg font-bold text-ink ring-4 ring-background md:relative">
                {i + 1}
              </span>
              <h3 className="text-2xl md:mt-5">{t}</h3>
              <p className="mt-2 text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* What makes trip prints different: the split. */}
      <section className="mx-auto mt-28 max-w-7xl px-5 md:px-10">
        <div className="grid items-center gap-12 rounded-[28px] bg-stage px-6 py-12 md:px-12 lg:grid-cols-[minmax(0,380px)_1fr] lg:py-16">
          <div>
            <h2 className="text-4xl md:text-5xl">Too far for one map? It becomes a set.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              When a trip crosses an ocean or a continent, one map would be mostly empty. We split
              it into two or three prints that follow your route in order, mark the distance in
              between, and add a small map of the whole trip.
            </p>
            <p className="mt-4 text-muted-foreground">
              You'll see whether your trip fits on one print, and from which size, before you order.
            </p>
          </div>
          <SplitTripArt />
        </div>
      </section>

      <section className="mx-auto mt-28 max-w-5xl px-5 text-center md:px-10">
        <p className="font-display text-3xl font-semibold leading-snug tracking-[-0.02em] md:text-[2.6rem] md:leading-[1.2]">
          Honeymoons. Road trips. The gap year, the semester abroad, the family trip everyone still
          talks about.
        </p>
      </section>

      {/* Print details, read straight from the price list. */}
      <section className="mx-auto mt-28 max-w-7xl px-5 md:px-10">
        <h2 className="max-w-2xl text-4xl md:text-5xl">Made to hang, made to last.</h2>
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1fr]">
          <div>
            <h3 className="text-xl">Sizes, on fine art paper</h3>
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {PRINT_SIZES.map((s) => (
                <li key={s.id} className="flex items-baseline justify-between py-3.5">
                  <span className="font-medium">{s.label} in</span>
                  <span className="text-muted-foreground">${formatPrice(s.id, 1)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              A set of two or three prints is priced per print.
            </p>
          </div>
          <div>
            <h3 className="text-xl">Finishes</h3>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {PRINT_FINISHES.map((f) => (
                <li key={f.id} className="rounded-2xl bg-muted p-5">
                  <p className="font-semibold">{f.label}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {f.description}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              Every photo is checked against your print size. If one is too small to print sharply,
              you'll know before you order.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-28 max-w-7xl px-5 md:px-10">
        <div className="flex flex-col items-start gap-6 rounded-[28px] bg-pin px-8 py-14 md:flex-row md:items-center md:justify-between md:px-14">
          <h2 className="text-4xl text-ink md:text-5xl">Where did you go?</h2>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="editorial" size="xl">
              <Link to="/create">Start your trip map</Link>
            </Button>
            <Button asChild variant="editorial-outline" size="xl" className="border-ink/30">
              <Link to="/journey">Paste your itinerary</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
