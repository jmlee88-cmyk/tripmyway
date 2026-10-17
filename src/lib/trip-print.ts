import type { TripDesign } from "@/types/trip";
import type { TripRenderOptions, TripRenderResult } from "@/print/render-trip-pdf";

/**
 * TRIP PRINT OUTPUT: a trip as a print-ready vector PDF, one page per print.
 * Same pattern as lib/print.ts: runs in the browser today; the renderer only
 * needs fetch, so it can move to a Worker for orders.
 */
export async function generateTripPrintFile(
  design: TripDesign,
  options: Omit<TripRenderOptions, "loadFont"> = {},
): Promise<TripRenderResult> {
  const [{ renderTripPdf }, { FONT_BASE_PATH }] = await Promise.all([
    import("@/print/render-trip-pdf"),
    import("@/print/fonts"),
  ]);
  return renderTripPdf(design, {
    ...options,
    loadFont: async (file) => {
      const r = await fetch(FONT_BASE_PATH + file);
      if (!r.ok) throw new Error(`Font ${file} failed to load (${r.status})`);
      return new Uint8Array(await r.arrayBuffer());
    },
  });
}
