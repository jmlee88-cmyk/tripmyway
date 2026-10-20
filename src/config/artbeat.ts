import type { FrameColor, PrintFinish } from "@/types/product";

/** "front" = the printed face only; "edge" = with bleed or canvas wrap. */
export type PrintEdge = "front" | "edge";

export const PRINT_EDGES: { id: PrintEdge; label: string; hint: string }[] = [
  {
    id: "front",
    label: "Front only",
    hint: "Exactly the printed face. ArtBeat adds its own bleed and canvas edge. Recommended.",
  },
  {
    id: "edge",
    label: "With bleed / canvas edge",
    hint: "Adds ⅛″ bleed, or a 1.5″ mirrored edge on canvas, to the file.",
  },
];

/**
 * ARTBEAT (fulfilment partner) — data only; the code is in fulfil/.
 *
 * Paid Shopify orders reach the separate `tripmyway-fulfil` Worker, which
 * turns each print into a JPEG at print resolution and stores it. In
 * "manual" mode (FULFIL_MODE, the default until the API is set up) the
 * files wait on the orders page for someone to place the order on ArtBeat
 * by hand. In "api" mode the Worker posts the order with one line per print.
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
   * What the print file covers. Each order can be remade either way from the
   * orders page; this is the starting choice.
   *  - "front": exactly the printed face (an 18 × 24 is 18 × 24″). ArtBeat adds
   *    its own bleed and canvas wrap from the front (owner, Oct 20 2026).
   *  - "edge":  the face plus bleed (paper, metal, acrylic) or, for canvas, the
   *    1.5″ mirrored gallery wrap on every side (an 18 × 24 canvas is 21 × 27″).
   */
  edge: "front" as PrintEdge,

  /** Bleed on each side when a non-canvas file is made with "edge". */
  bleedIn: 0.125,

  /** Canvas is a 1.5″ gallery wrap with mirrored edges (ArtBeat, Oct 19 2026). */
  canvas: { wrapIn: 1.5 },

  /**
   * ArtBeat product codes, one per finish and frame, built on ArtBeat's API
   * page (e.g. "WHTGLOS_BLKALM"). The size goes on each line separately.
   * Only needed in "api" mode: there an empty code stops that order with
   * "needs attention" instead of guessing. Manual mode doesn't use them.
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
