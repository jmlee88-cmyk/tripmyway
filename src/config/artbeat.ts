import type { FrameColor, PrintFinish } from "@/types/product";

/**
 * ARTBEAT (fulfilment partner) — data only; the code is in fulfil/.
 *
 * Paid Shopify orders are sent to ArtBeat's partner API by the separate
 * `tripmyway-fulfil` Worker: it turns each print into a JPEG at print
 * resolution, stores it, and posts the order with one line per print.
 * ArtBeat prices the order from our vendor tier (no prices are sent),
 * charges the card on file, and pushes fulfilment and tracking back to
 * Shopify itself.
 */
export const ARTBEAT = {
  /** Partner API. Dev accepts and validates orders but never produces them. */
  apiBase: {
    dev: "https://artflow-dev.artbeatstudios.com",
    // PLACEHOLDER: confirm the live address with ArtBeat before switching.
    live: "https://artflow.artbeatstudios.com",
  },

  /** Print files: ArtBeat takes JPG, PNG or TIF (not PDF). */
  file: {
    format: "jpg" as "jpg" | "tif",
    /** Pixels per inch at the printed size. 32 × 48 at 300 → 9,600 × 14,400 px. */
    dpi: 300,
    jpegQuality: 92,
    /** Files are consumed within 48 hours; the bucket deletes them after this many days. */
    keepDays: 14,
  },

  /**
   * Canvas is a 1.5″ gallery wrap with mirrored edges (ArtBeat, Oct 19 2026).
   * The file includes the 1.5″ mirrored edge on every side (an 18 × 24 canvas
   * file is 21 × 27″); the line's size stays the face size. If ArtBeat's
   * canvas preset adds the mirror itself, set mirrorInFile to false.
   */
  canvas: { wrapIn: 1.5, mirrorInFile: true },

  /**
   * ArtBeat product codes, one per finish and frame, built on ArtBeat's API
   * page (e.g. "WHTGLOS_BLKALM"). The size goes on each line separately.
   * An empty code stops that order with "needs setup" instead of guessing.
   * Frames follow ArtBeat's list: box frames for paper (white, black, natural,
   * gold, silver); float frames for canvas (white, black, natural) and for
   * metal and acrylic (white, black).
   */
  productCodes: {
    paper: { none: "", white: "", black: "", natural: "", gold: "", silver: "" },
    canvas: { none: "", white: "", black: "", natural: "" },
    metal: { none: "", white: "", black: "" },
    acrylic: { none: "", white: "", black: "" },
  } as Record<PrintFinish, Partial<Record<FrameColor, string>>>,
} as const;

/** The ArtBeat product code for a finish and frame, or "" when not set up yet. */
export function artbeatProductCode(finish: PrintFinish, frame: FrameColor): string {
  return ARTBEAT.productCodes[finish]?.[frame] ?? "";
}
