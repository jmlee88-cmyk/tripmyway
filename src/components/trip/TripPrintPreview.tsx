import { useEffect, useRef, useState } from "react";
import type { TripDesign } from "@/types/trip";
import type { Placement } from "@/lib/trip/placement";
import { generateTripPrintFile } from "@/lib/trip-print";
import { PdfPagePreview } from "@/components/studio/PdfPagePreview";
import { getPrintSize } from "@/config/products";

interface Drawn {
  key: string;
  bytes: Uint8Array;
  pages: number;
  widthIn: number;
  heightIn: number;
  placements: Placement[];
}

/** Recently drawn previews, so going back to a size (or any earlier state) is instant. */
const drawn = new Map<string, Drawn>();
function remember(d: Drawn) {
  drawn.delete(d.key);
  drawn.set(d.key, d);
  while (drawn.size > 8) drawn.delete(drawn.keys().next().value!);
}

/** Everything about the trip except its size: when only the size changes, this stays the same. */
function contentKey(design: TripDesign, placeholders: boolean) {
  const { printSize: _size, ...rest } = design;
  return JSON.stringify([rest, placeholders]);
}

/**
 * The real trip print file (the PDF the printer gets), rendered on screen:
 * one sheet per print. Re-renders when the design changes; the latest
 * request wins and the previous sheets stay (dimmed) until it's ready.
 */
export function TripPrintPreview({
  design,
  placeholders = true,
  width = 420,
  onRendered,
}: {
  design: TripDesign;
  placeholders?: boolean;
  width?: number;
  onRendered?: (r: { pages: number; placements: Placement[] }) => void;
}) {
  const key = JSON.stringify([design, placeholders]);
  const content = contentKey(design, placeholders);
  const run = useRef(0);
  const shownContent = useRef<string | null>(null);
  const [state, setState] = useState<Drawn | null>(null);
  const [progress, setProgress] = useState<string | null>("Drawing your map");
  const [error, setError] = useState<string | null>(null);
  // Only the size changed, to one of the same shape: the map is the same, so keep
  // showing it as it is (no dimming, no "Drawing…") and swap in the redraw when it's
  // ready. Markers, names and photo spots can still move a little between sizes.
  const s = getPrintSize(design.printSize);
  const quiet =
    !!state &&
    shownContent.current === content &&
    Math.abs(s.widthIn / s.heightIn - state.widthIn / state.heightIn) < 1e-6;

  useEffect(() => {
    const id = ++run.current;
    const cached = drawn.get(key);
    if (cached) {
      setError(null);
      setProgress(null);
      setState(cached);
      shownContent.current = content;
      onRendered?.({ pages: cached.pages, placements: cached.placements });
      return;
    }
    const t = setTimeout(
      async () => {
        setError(null);
        try {
          const res = await generateTripPrintFile(design, {
            bleedIn: 0,
            placeholderPhotos: placeholders,
            onProgress: (p) => id === run.current && !quiet && setProgress(p),
          });
          const d: Drawn = {
            key,
            bytes: res.bytes,
            pages: res.pages,
            widthIn: res.widthIn,
            heightIn: res.heightIn,
            placements: res.placements,
          };
          remember(d);
          if (id !== run.current) return;
          setState(d);
          shownContent.current = content;
          onRendered?.({ pages: res.pages, placements: res.placements });
        } catch (e) {
          if (id === run.current) setError(e instanceof Error ? e.message : String(e));
        } finally {
          if (id === run.current) setProgress(null);
        }
      },
      quiet ? 0 : 300,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // A preview drawn before for exactly this design shows straight away.
  const remembered = drawn.get(key);
  const view = remembered ?? state;
  const stale = view?.key !== key && !quiet;
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {error || quiet || remembered ? null : progress ? `${progress}…` : null}
      </p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          We couldn't draw the map just now. Please try again in a moment.
        </p>
      )}
      {view && (
        <div
          className={`mt-3 flex flex-wrap gap-6 transition-opacity ${stale ? "opacity-50" : ""}`}
        >
          {Array.from({ length: view.pages }, (_, i) => (
            <figure key={`page-${i}`} className="flex max-w-full flex-col gap-2">
              <div className="max-w-full bg-background shadow-print">
                <PdfPagePreview
                  bytes={view.bytes}
                  page={i + 1}
                  width={width}
                  height={(width * view.heightIn) / view.widthIn}
                  className="block h-auto max-w-full"
                />
              </div>
              {view.pages > 1 && (
                <figcaption className="text-xs text-muted-foreground">
                  Print {i + 1} of {view.pages}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
