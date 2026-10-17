import type { Customization } from "@/types/product";

/**
 * PRINT OUTPUT. Renders a saved Customization to a print-ready vector PDF at
 * the physical size, using the same map style, framing and poster layout as
 * the on-screen preview (see src/print/render-pdf.ts).
 *
 * Runs in the browser today (the /studio/print page). The renderer only needs
 * `fetch`, so the same call can move to a Worker or Node job triggered by a
 * Shopify `orders/paid` webhook without changes.
 */
export interface PrintFileResult {
  status: "ready";
  format: "pdf";
  fileName: string;
  bytes: Uint8Array;
  widthIn: number;
  heightIn: number;
  bleedIn: number;
  wrapIn: number;
  tileCount: number;
}

export interface PrintFileOptions {
  bleedIn?: number;
  orderRef?: string;
  onProgress?: (step: string) => void;
  /** Canvas: add the mirrored gallery wrap (default). Off for screen previews. */
  canvasWrap?: boolean;
}

export async function generatePrintFile(
  configuration: Customization,
  options: PrintFileOptions = {},
): Promise<PrintFileResult> {
  const [{ renderPrintPdf }, { FONT_BASE_PATH }] = await Promise.all([
    import("@/print/render-pdf"),
    import("@/print/fonts"),
  ]);
  const res = await renderPrintPdf(configuration, {
    ...options,
    loadFont: async (file) => {
      const r = await fetch(FONT_BASE_PATH + file);
      if (!r.ok) throw new Error(`Font ${file} failed to load (${r.status})`);
      return new Uint8Array(await r.arrayBuffer());
    },
  });
  return { status: "ready", format: "pdf", ...res };
}
