import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { FrameColor, Location, PrintFinish, PrintSizeId } from "@/types/product";
import type { TripDesign, TripPhoto, TripStop } from "@/types/trip";
import { DEFAULT_STYLE_ID } from "@/config/map-styles";
import {
  FRAME_COLOR_LABELS,
  FRAME_STYLES,
  PRINT_FINISHES,
  PRINT_SIZES,
  TITLE_MAX,
  formatPrice,
  framePrice,
  getPrintSize,
} from "@/config/products";
import { JOURNEY } from "@/config/journey";
import { TRIP } from "@/config/trip";
import { plansBySize } from "@/lib/trip/plan";
import { fitPhotoToSize, photoTooSmall } from "@/lib/trip/photos";
import { addTripToCart, validateTrip } from "@/lib/trip-cart";
import { formatKm } from "@/print/render-trip-pdf";
import { track } from "@/lib/analytics";
import { LocationSearch } from "@/components/editor/LocationSearch";
import { TripPhotoField } from "@/components/trip/TripPhotoField";
import { TripPrintPreview } from "@/components/trip/TripPrintPreview";
import { Button } from "@/components/ui/button";

/** One stop as the customer edits it (found on the map, or still being looked up). */
export interface StopDraft {
  id: string;
  /** What was searched for, shown when the place couldn't be found. */
  query: string;
  countryCode: string;
  label: string;
  date: string;
  location: Location | null;
  lookup: "pending" | "found" | "missing";
  photo?: TripPhoto | undefined;
}

export function stopFromLocation(l: Location): StopDraft {
  return {
    id: crypto.randomUUID(),
    query: l.name,
    countryCode: "",
    label: l.name.slice(0, JOURNEY.labelMax),
    date: "",
    location: l,
    lookup: "found",
  };
}

/**
 * The trip editor shared by Create (stops added one by one) and Map Your
 * Journey (stops read from an itinerary): the stops in order with a photo
 * each, the real print beside them, size, finish, frame and add to cart.
 */
export function TripEditor({
  stops,
  setStops,
  title,
  setTitle,
  notice,
  styleId = DEFAULT_STYLE_ID,
}: {
  stops: StopDraft[];
  setStops: Dispatch<SetStateAction<StopDraft[]>>;
  title: string;
  setTitle: (t: string) => void;
  notice?: ReactNode;
  styleId?: string;
}) {
  const navigate = useNavigate();
  const [printSize, setPrintSize] = useState<PrintSizeId>("18x24");
  const [finish, setFinish] = useState<PrintFinish>("paper");
  const [frame, setFrame] = useState<FrameColor>("none");
  const [stripPrints, setStripPrints] = useState<number[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const patch = (i: number, p: Partial<StopDraft>) =>
    setStops((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const move = (i: number, by: -1 | 1) =>
    setStops((ds) => {
      const next = [...ds];
      const [d] = next.splice(i, 1);
      next.splice(i + by, 0, d!);
      return next;
    });
  const remove = (i: number) => setStops((ds) => ds.filter((_, j) => j !== i));
  const add = (l: Location) => {
    setStops((ds) => (ds.length < TRIP.maxStops ? [...ds, stopFromLocation(l)] : ds));
    track("trip_stop_added");
  };

  const frameStyle = FRAME_STYLES[finish];
  const frameNow: FrameColor =
    frame !== "none" && frameStyle.colors.includes(frame) ? frame : "none";
  const allFound = stops.length > 0 && stops.every((d) => d.location);
  const design: TripDesign | null = useMemo(() => {
    if (!allFound) return null;
    return {
      title: title.trim() || "My trip",
      styleId,
      printSize,
      finish,
      frame: frameNow,
      stops: stops.map((d): TripStop => ({
        id: d.id,
        label: d.label.trim() || d.location!.name,
        location: d.location!,
        ...(d.date.trim() ? { date: d.date.trim() } : {}),
        ...(d.photo ? { photo: fitPhotoToSize(d.photo, printSize) } : {}),
      })),
    };
  }, [allFound, stops, title, printSize, finish, frameNow, styleId]);

  // Where each stop is matters only for the map; the preview re-renders on these.
  const previewKey = design ? JSON.stringify({ ...design, finish: null, frame: null }) : "";
  const previewDesign = useMemo((): TripDesign | null => {
    if (!design) return null;
    const { finish: _finish, frame: _frame, ...rest } = design;
    return rest;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  const bySize = useMemo(
    () =>
      design
        ? plansBySize(
            design.stops.map((s) => ({ lng: s.location.longitude, lat: s.location.latitude })),
            PRINT_SIZES,
            design.styleId,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      design &&
        JSON.stringify(design.stops.map((s) => [s.location.latitude, s.location.longitude])),
    ],
  );
  const printsAt = (id: PrintSizeId) =>
    bySize?.find((b) => b.size.id === id)?.plan.panels.length ?? 1;
  const plan = bySize?.find((b) => b.size.id === printSize)?.plan;
  const singleFrom = bySize?.find((b) => b.plan.panels.length === 1 && b.plan.fits)?.size;
  const size = getPrintSize(printSize);
  const prints = printsAt(printSize);
  const price = formatPrice(printSize, prints, finish, frameNow);
  const errors = design ? validateTrip(design) : ["Find every stop on the map first."];

  function onAdd() {
    if (!design || errors.length) {
      setShowErrors(true);
      return;
    }
    try {
      addTripToCart(design);
      toast("Added to your cart", { description: `${design.title}, ${size.label} in` });
      void navigate({ to: "/cart" });
    } catch (e) {
      toast("Couldn't add this trip", { description: e instanceof Error ? e.message : "" });
    }
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
      <div className="min-w-0">
        <label className="block">
          <span className="eyebrow">Trip name</span>
          <input
            id="trip-title"
            value={title}
            maxLength={TITLE_MAX}
            placeholder="Name your trip"
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 border-transparent bg-transparent px-0 py-1 font-display text-4xl font-bold tracking-[-0.03em] outline-none transition-colors placeholder:text-muted-foreground/50 hover:border-b-border focus:border-b-foreground md:text-5xl"
          />
        </label>
        {notice}

        <ol className="mt-6 flex flex-col gap-3">
          {stops.map((d, i) => (
            <li key={d.id} className="rounded-2xl border-2 border-border bg-card p-4 md:p-5">
              <div className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-pin font-display text-sm font-bold text-ink"
                >
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Stop {i + 1} name</span>
                      <input
                        id={`stop-${i}-label`}
                        value={d.label}
                        maxLength={JOURNEY.labelMax}
                        onChange={(e) => patch(i, { label: e.target.value })}
                        className="w-full border-b-2 border-transparent bg-transparent py-0.5 font-display text-2xl font-semibold outline-none transition-colors hover:border-border focus:border-foreground"
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
                        className="w-28 border-b-2 border-transparent bg-transparent py-0.5 text-sm text-muted-foreground outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus:border-foreground"
                      />
                    </label>
                    <div className="flex items-center">
                      <IconButton
                        label={`Move ${d.label} earlier`}
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label={`Move ${d.label} later`}
                        disabled={i === stops.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </IconButton>
                      <IconButton label={`Remove ${d.label}`} onClick={() => remove(i)}>
                        <X className="h-4 w-4" />
                      </IconButton>
                    </div>
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
                  {d.lookup === "missing" && (
                    <LocationSearch
                      compact
                      value={null}
                      placeholder="Search for this place"
                      onSelect={(l) => patch(i, { location: l, lookup: "found" })}
                    />
                  )}
                  {d.lookup === "found" && (
                    <ChangePlace onSelect={(l) => patch(i, { location: l })} />
                  )}
                  <div className="mt-2">
                    <TripPhotoField
                      photo={d.photo}
                      sizeId={printSize}
                      stopName={d.label.trim() || d.location?.name || `stop ${i + 1}`}
                      onChange={(photo) => patch(i, { photo })}
                    />
                  </div>
                </div>
              </div>
            </li>
          ))}
          {stops.length < TRIP.maxStops ? (
            <li className="rounded-2xl border-2 border-dashed border-border p-4 md:p-5">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-dashed border-foreground/30 font-display text-sm font-bold text-muted-foreground"
                >
                  {stops.length + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xl font-semibold">
                    {stops.length === 0 ? "Where did your trip start?" : "Where did you go next?"}
                  </p>
                  <div className="mt-2">
                    <LocationSearch
                      compact
                      value={null}
                      placeholder="Search a city, town, park or landmark"
                      onSelect={add}
                    />
                  </div>
                </div>
              </div>
            </li>
          ) : (
            <li className="px-1 text-sm text-muted-foreground">
              That's the most a trip print holds ({TRIP.maxStops} stops).
            </li>
          )}
        </ol>
      </div>

      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-[22px] bg-stage p-4 sm:p-6">
          {previewDesign ? (
            <TripPrintPreview
              design={previewDesign}
              onRendered={(r) =>
                setStripPrints(r.placements.flatMap((p, k) => (p.mode === "strip" ? [k + 1] : [])))
              }
            />
          ) : (
            <div className="grid aspect-[3/4] place-items-center rounded-xl border-2 border-dashed border-foreground/15 p-8 text-center text-muted-foreground">
              {stops.some((d) => d.lookup === "pending")
                ? "Finding your stops on the map…"
                : stops.length === 0
                  ? "Add your first stop and your map appears here."
                  : "Find the stops we couldn't place, and your map appears here."}
            </div>
          )}
        </div>

        {plan && (
          <div className="mt-4 text-sm leading-relaxed" aria-live="polite">
            {plan.panels.length === 1 ? (
              <p>Your whole trip fits on one {size.label} print.</p>
            ) : (
              <p>
                Your trip covers a lot of ground, so it's mapped across {plan.panels.length} prints
                that hang together
                {plan.breaks.length > 0 && (
                  <>
                    , split at{" "}
                    {plan.breaks
                      .map(
                        (b) =>
                          `${design!.stops[b.after]!.label} to ${design!.stops[b.after + 1]!.label} (about ${formatKm(b.km)} km)`,
                      )
                      .join(" and ")}
                  </>
                )}
                . A small map of the whole route ties them together.
              </p>
            )}
            {plan.panels.length > 1 && singleFrom && (
              <p className="mt-1 text-muted-foreground">
                Prefer one print? It fits on one from {singleFrom.label} in up.
              </p>
            )}
            {stripPrints.length > 0 && (
              <p className="mt-1 text-muted-foreground">
                Some stops are close together, so on{" "}
                {stripPrints.length > 1 ? "those prints" : "that print"} the stop names show without
                photos for now.
              </p>
            )}
          </div>
        )}

        <fieldset className="mt-8">
          <legend className="font-display text-lg font-bold">Size</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PRINT_SIZES.map((s) => {
              const blocked = stops.some((d) => d.photo && photoTooSmall(d.photo, s.id));
              const n = printsAt(s.id);
              const on = s.id === printSize;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  disabled={blocked}
                  title={blocked ? "A photo is too small for this size" : undefined}
                  onClick={() => setPrintSize(s.id)}
                  className={`rounded-xl border-2 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${on ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/50"}`}
                >
                  <span className="block text-sm font-semibold">{s.label} in</span>
                  <span
                    className={`block text-xs ${on ? "text-background/75" : "text-muted-foreground"}`}
                  >
                    {blocked
                      ? "Photo too small"
                      : `$${formatPrice(s.id, n, finish, frameNow)}${n > 1 ? `, set of ${n}` : ""}`}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="font-display text-lg font-bold">Finish</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRINT_FINISHES.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={f.id === finish}
                onClick={() => setFinish(f.id)}
                className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-colors ${f.id === finish ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/50"}`}
              >
                {f.short}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {PRINT_FINISHES.find((f) => f.id === finish)?.description}
          </p>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="font-display text-lg font-bold">Frame</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["none", ...frameStyle.colors] as FrameColor[]).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={c === frameNow}
                onClick={() => setFrame(c)}
                className={`rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors ${c === frameNow ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/50"}`}
              >
                {FRAME_COLOR_LABELS[c]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {frameNow === "none"
              ? `${frameStyle.label}: +$${framePrice(printSize, finish) * prints} at ${size.label} in.`
              : frameStyle.description}
          </p>
        </fieldset>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t-2 border-border pt-6">
          <div>
            <p className="font-display text-3xl font-bold">${price}</p>
            <p className="text-sm text-muted-foreground">
              {prints > 1 ? `Set of ${prints} prints, ` : ""}
              {size.label} in, {PRINT_FINISHES.find((f) => f.id === finish)?.label.toLowerCase()}
              {frameNow !== "none" ? `, ${FRAME_COLOR_LABELS[frameNow].toLowerCase()} frame` : ""}
            </p>
          </div>
          <Button variant="editorial" size="xl" onClick={onAdd} disabled={!design}>
            Add to cart
          </Button>
        </div>
        {showErrors && errors.length > 0 && (
          <ul role="alert" className="mt-3 flex flex-col gap-1 text-sm text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** "Wrong place?" folds a search open only when it's needed. */
function ChangePlace({ onSelect }: { onSelect: (l: Location) => void }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Wrong place?
      </button>
    );
  return (
    <LocationSearch
      compact
      value={null}
      placeholder="Search for the right place"
      onSelect={(l) => {
        onSelect(l);
        setOpen(false);
      }}
    />
  );
}
