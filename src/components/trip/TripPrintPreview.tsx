import { useEffect, useRef, useState } from "react";
import type { TripDesign } from "@/types/trip";
import type { Placement } from "@/lib/trip/placement";
import { generateTripPrintFile } from "@/lib/trip-print";
import { PdfPagePreview } from "@/components/studio/PdfPagePreview";

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
  const run = useRef(0);
  const [state, setState] = useState<{
    key: string;
    bytes: Uint8Array;
    pages: number;
    widthIn: number;
    heightIn: number;
  } | null>(null);
  const [progress, setProgress] = useState<string | null>("Drawing your map");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = ++run.current;
    const t = setTimeout(async () => {
      setError(null);
      try {
        const res = await generateTripPrintFile(design, {
          bleedIn: 0,
          placeholderPhotos: placeholders,
          onProgress: (p) => id === run.current && setProgress(p),
        });
        if (id !== run.current) return;
        setState({
          key,
          bytes: res.bytes,
          pages: res.pages,
          widthIn: res.widthIn,
          heightIn: res.heightIn,
        });
        onRendered?.({ pages: res.pages, placements: res.placements });
      } catch (e) {
        if (id === run.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === run.current) setProgress(null);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const stale = state?.key !== key;
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {error ? null : progress ? `${progress}…` : null}
      </p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          We couldn't draw the map just now. Please try again in a moment.
        </p>
      )}
      {state && (
        <div
          className={`mt-3 flex flex-wrap gap-6 transition-opacity ${stale ? "opacity-50" : ""}`}
        >
          {Array.from({ length: state.pages }, (_, i) => (
            <figure key={`${state.key}:${i}`} className="flex max-w-full flex-col gap-2">
              <div className="max-w-full bg-background shadow-print">
                <PdfPagePreview
                  bytes={state.bytes}
                  page={i + 1}
                  width={width}
                  height={(width * state.heightIn) / state.widthIn}
                  className="block h-auto max-w-full"
                />
              </div>
              {state.pages > 1 && (
                <figcaption className="text-xs text-muted-foreground">
                  Print {i + 1} of {state.pages}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
