/** What the fulfil Worker keeps per order (R2 `orders/<id>.json`). */
import type { PrintEdge } from "@/config/artbeat";
import type { ShopifyOrder } from "@/lib/fulfil/shopify";

export type State =
  | "queued"
  | "making files"
  /** Manual mode: files are made, waiting for someone to order on ArtBeat. */
  | "ready to order"
  /** Manual mode: someone placed it on ArtBeat and said so on the orders page. */
  | "ordered by hand"
  | "accepted"
  | "rejected"
  | "needs attention"
  | "skipped";

export interface PrintFile {
  name: string;
  url: string;
  /** Pixels. */
  width?: number | undefined;
  height?: number | undefined;
  /** Which print of the trip, as on the Shopify line. */
  part?: number;
  parts?: number;
  quantity?: number;
  tripName?: string;
  sizeLabel?: string;
  finishLabel?: string;
  frameLabel?: string;
  edge?: PrintEdge;
  /** Inches the file covers, including any bleed or canvas edge. */
  fileWidthIn?: number;
  fileHeightIn?: number;
}

export interface OrderRecord {
  order: ShopifyOrder;
  state: State;
  receivedAt: string;
  updatedAt: string;
  /** Random part of the file links, so they can't be guessed. */
  fileToken: string;
  /** What the print files cover; set from the orders page, else the default. */
  edge?: PrintEdge;
  files: PrintFile[];
  artbeat?: { id: string; hubOrderCreated: boolean; env: string; at: string };
  /** Manual mode: when it was ordered on ArtBeat, and ArtBeat's order number if given. */
  manual?: { artbeatOrder?: string; at: string };
  /** Shown on the orders page: why it stopped, or things to check. */
  problems: string[];
  attempts: number;
  log: string[];
}
