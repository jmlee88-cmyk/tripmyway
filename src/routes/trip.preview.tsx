import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PrintSizeId } from "@/types/product";
import type { TripDesign, TripPhoto } from "@/types/trip";
import { MAP_STYLES } from "@/config/map-styles";
import { PRINT_SIZES, getPrintSize } from "@/config/products";
import { SAMPLE_TRIPS } from "@/config/trip-samples";
import { fitPhotoToSize } from "@/lib/trip/photos";
import { TripPhotoField } from "@/components/trip/TripPhotoField";
import { plansBySize } from "@/lib/trip/plan";
import { formatKm } from "@/print/render-trip-pdf";
import { generateTripPrintFile } from "@/lib/trip-print";
import { PdfPagePreview } from "@/components/studio/PdfPagePreview";
import { Button } from "@/components/ui/button";

/**
 * Trip print preview: renders the real print file (the same PDF the printer
 * gets) for a sample trip, on real map data, so layout B, splits and photo
 * placement can be judged on real geography. Not linked from the site.
 */
export const Route = createFileRoute("/trip/preview")({
  head: () => ({
    meta: [
      { title: "Trip print preview | TripMyWay" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TripPreview,
});

const PREVIEW_WIDTH = 460;

interface Rendered {
  key: string;
  bytes: Uint8Array;
  url: string;
  fileName: string;
  pages: number;
  widthIn: number;
  heightIn: number;
  stripPrints: number[];
  ms: number;
}

function TripPreview() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [sampleId, setSampleId] = useState(SAMPLE_TRIPS[0]!.id);
  const [printSize, setPrintSize] = useState<PrintSizeId>("18x24");
  const [styleId, setStyleId] = useState("modern-minimal");
  const [placeholders, setPlaceholders] = useState(true);
  const [photos, setPhotos] = useState<Record<string, TripPhoto>>({});
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const run = useRef(0);

  const sample = SAMPLE_TRIPS.find((s) => s.id === sampleId) ?? SAMPLE_TRIPS[0]!;
  const design: TripDesign = useMemo(
    () => ({
      ...sample.design,
      printSize,
      styleId,
      stops: sample.design.stops.map((s) => {
        const photo = photos[`${sample.id}:${s.id}`];
        return photo ? { ...s, photo: fitPhotoToSize(photo, printSize) } : s;
      }),
    }),
    [sample, printSize, styleId, photos],
  );
  const key = JSON.stringify([design, placeholders]);

  const bySize = useMemo(
    () =>
      plansBySize(
        design.stops.map((s) => ({ lng: s.location.longitude, lat: s.location.latitude })),
        PRINT_SIZES,
        styleId,
      ),
    [design.stops, styleId],
  );
  const plan = bySize.find((b) => b.size.id === printSize)!.plan;
  const singleFrom = bySize.find((b) => b.plan.panels.length === 1 && b.plan.fits)?.size;

  // Render the print file whenever the trip changes (latest request wins).
  useEffect(() => {
    if (!mounted) return;
    const id = ++run.current;
    const t = setTimeout(async () => {
      setError(null);
      const t0 = performance.now();
      try {
        const res = await generateTripPrintFile(design, {
          bleedIn: 0,
          placeholderPhotos: placeholders,
          onProgress: (p) => id === run.current && setProgress(p),
        });
        if (id !== run.current) return;
        const url = URL.createObjectURL(
          new Blob([res.bytes as BlobPart], { type: "application/pdf" }),
        );
        setRendered((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return {
            key,
            bytes: res.bytes,
            url,
            fileName: res.fileName,
            pages: res.pages,
            widthIn: res.widthIn,
            heightIn: res.heightIn,
            stripPrints: res.placements.flatMap((p, i) => (p.mode === "strip" ? [i + 1] : [])),
            ms: performance.now() - t0,
          };
        });
      } catch (e) {
        if (id === run.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === run.current) setProgress(null);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mounted]);

  async function addPhoto(stopId: string, file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => undefined);
    setPhotos((p) => ({
      ...p,
      [`${sample.id}:${stopId}`]: {
        key: `${file.name}:${file.size}:${file.lastModified}`,
        url,
        widthPx: img.naturalWidth,
        heightPx: img.naturalHeight,
      },
    }));
  }

  if (!mounted) return <div className="min-h-[60vh]" />;

  const size = getPrintSize(printSize);
  const stale = rendered?.key !== key;

  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-12 md:px-10">
      <p className="eyebrow">Internal</p>
      <h1 className="mt-3 text-5xl">Trip print preview</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        The actual print file for a sample trip, drawn on real map data: the same PDF the printer
        receives. Change the trip, size or style, or add your own photos to the stops.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="trip-sample" className="eyebrow">
              Trip
            </label>
            <select
              id="trip-sample"
              value={sampleId}
              onChange={(e) => setSampleId(e.target.value)}
              className="h-11 border border-border bg-background px-3 text-sm"
            >
              {SAMPLE_TRIPS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="trip-size" className="eyebrow">
                Size
              </label>
              <select
                id="trip-size"
                value={printSize}
                onChange={(e) => setPrintSize(e.target.value as PrintSizeId)}
                className="h-11 border border-border bg-background px-3 text-sm"
              >
                {PRINT_SIZES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} in
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="trip-style" className="eyebrow">
                Style
              </label>
              <select
                id="trip-style"
                value={styleId}
                onChange={(e) => setStyleId(e.target.value)}
                className="h-11 border border-border bg-background px-3 text-sm"
              >
                {MAP_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label htmlFor="trip-placeholders" className="flex items-center gap-3 text-sm">
            <input
              id="trip-placeholders"
              type="checkbox"
              checked={placeholders}
              onChange={(e) => setPlaceholders(e.target.checked)}
              className="h-4 w-4"
            />
            Show empty photo spots for stops without a photo
          </label>

          <section className="border border-border p-4 text-sm" aria-live="polite">
            <p className="eyebrow">How it fits</p>
            {plan.panels.length === 1 ? (
              <p className="mt-2">Fits on one {size.label} print.</p>
            ) : (
              <p className="mt-2">
                Too spread out for one {size.label} print, so it's split into {plan.panels.length}{" "}
                prints
                {plan.breaks.length > 0 && (
                  <>
                    , at{" "}
                    {plan.breaks
                      .map(
                        (b) =>
                          `${design.stops[b.after]!.label} → ${design.stops[b.after + 1]!.label} (about ${formatKm(b.km)} km)`,
                      )
                      .join(" and ")}
                  </>
                )}
                .
              </p>
            )}
            {!plan.fits && (
              <p className="mt-2 text-destructive">
                Even split three ways, part of this trip is crowded or very spread out.
              </p>
            )}
            {plan.panels.length > 1 && singleFrom && (
              <p className="mt-2 text-muted-foreground">
                Fits on one print from {singleFrom.label} in up.
              </p>
            )}
            {rendered && !stale && rendered.stripPrints.length > 0 && (
              <p className="mt-2 text-muted-foreground">
                Print {rendered.stripPrints.join(", ")} is too crowded for photos on the map. It
                will use a photo strip (not built yet; names only for now).
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <p className="eyebrow">Stops and photos</p>
            <ol className="flex flex-col gap-3">
              {design.stops.map((s, i) => {
                const photoKey = `${sample.id}:${s.id}`;
                return (
                  <li key={s.id} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">
                        <span className="mr-2 font-mono text-xs text-muted-foreground">
                          {i + 1}
                        </span>
                        {s.label}
                      </span>
                    </div>
                    <TripPhotoField
                      photo={photos[photoKey]}
                      sizeId={printSize}
                      stopName={s.label}
                      onChange={(photo) =>
                        setPhotos((p) => {
                          const { [photoKey]: _old, ...rest } = p;
                          return photo ? { ...rest, [photoKey]: photo } : rest;
                        })
                      }
                    />
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {error
                ? null
                : progress
                  ? `${progress}…`
                  : rendered
                    ? `${rendered.pages} print${rendered.pages > 1 ? "s" : ""} · rendered in ${(rendered.ms / 1000).toFixed(1)} s`
                    : "Rendering…"}
            </p>
            {rendered && (
              <Button asChild variant="editorial-outline" size="sm">
                <a href={rendered.url} download={rendered.fileName}>
                  Download PDF
                </a>
              </Button>
            )}
          </div>
          {error && (
            <p className="mt-4 text-sm text-destructive" role="alert">
              The print couldn't be drawn: {error}
            </p>
          )}
          {rendered && (
            <div
              className={`mt-6 flex flex-wrap gap-8 transition-opacity ${stale ? "opacity-50" : ""}`}
            >
              {Array.from({ length: rendered.pages }, (_, i) => (
                <figure key={`${rendered.key}:${i}`} className="flex flex-col gap-2">
                  <div className="bg-background shadow-print">
                    <PdfPagePreview
                      bytes={rendered.bytes}
                      page={i + 1}
                      width={PREVIEW_WIDTH}
                      height={(PREVIEW_WIDTH * rendered.heightIn) / rendered.widthIn}
                      className="block max-w-full"
                    />
                  </div>
                  {rendered.pages > 1 && (
                    <figcaption className="text-xs text-muted-foreground">
                      Print {i + 1} of {rendered.pages}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
