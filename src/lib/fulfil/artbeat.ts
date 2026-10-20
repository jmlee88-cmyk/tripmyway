import type { FrameColor, PrintFinish } from "@/types/product";
import type { TripDesign } from "@/types/trip";
import { ARTBEAT, artbeatProductCode, type PrintEdge } from "@/config/artbeat";
import { FRAME_STYLES, frameLabel, getFinish, getPrintSize } from "@/config/products";
import { planTrip } from "@/lib/trip/plan";
import { parseTripDesign } from "@/lib/trip/design";
import type { Address, ShopifyOrder } from "./shopify";

/**
 * ArtBeat side of fulfilment: which print files an order needs, and the
 * order body for ArtBeat's partner API. Pure, so it's tested here and run
 * by the fulfil Worker.
 *
 * One ArtBeat line per physical print: a trip split into a set of two or
 * three becomes two or three lines (each its own file), with the Shopify
 * quantity on every line.
 */
export interface PrintJob {
  lineItemId: string;
  /** Which print of the trip (1-based) and how many it has. */
  part: number;
  parts: number;
  quantity: number;
  design: TripDesign;
  finish: PrintFinish;
  frame: FrameColor;
  /** "" in manual mode when not set up yet. */
  productCode: string;
  /** Printed size in inches (portrait, as designed). */
  size: { width: number; height: number };
  /** What the file covers, and how much it adds on each side (inches). */
  edge: PrintEdge;
  bleedIn: number;
  mirrorWrapIn: number;
  /** For people: the Shopify line title, trip name, size, finish and frame. */
  title: string;
  tripName: string;
  sizeLabel: string;
  finishLabel: string;
  frameLabel: string;
  /** e.g. "1001-123456-2of3-front.jpg" */
  fileName: string;
}

export interface PlanOptions {
  /** API mode needs an ArtBeat product code for every finish and frame; manual mode doesn't. */
  requireProductCodes?: boolean;
  edge?: PrintEdge;
}

/** Bleed and canvas wrap a file adds on each side, by edge choice and finish. */
export function fileEdges(edge: PrintEdge, finish: PrintFinish) {
  if (edge === "front") return { bleedIn: 0, mirrorWrapIn: 0 };
  return finish === "canvas"
    ? { bleedIn: 0, mirrorWrapIn: ARTBEAT.canvas.wrapIn }
    : { bleedIn: ARTBEAT.bleedIn, mirrorWrapIn: 0 };
}

export interface PrintPlan {
  prints: PrintJob[];
  /** Reasons the order can't be sent automatically (shown on the status page). */
  problems: string[];
}

export function planPrints(order: ShopifyOrder, opts: PlanOptions = {}): PrintPlan {
  const requireCodes = opts.requireProductCodes ?? true;
  const edge = opts.edge ?? ARTBEAT.edge;
  const prints: PrintJob[] = [];
  const problems: string[] = [];
  const ours = order.lines.filter((l) => l.design);
  if (!ours.length) problems.push("No TripMyWay prints on this order.");
  for (const line of ours) {
    const parsed = parseTripDesign(line.design!);
    if (typeof parsed === "string") {
      problems.push(
        /isn't a trip/.test(parsed)
          ? `"${line.title}" is a single-place design: make its file in the print studio (/studio/print on the site) and order it by hand.`
          : `"${line.title}": ${parsed}`,
      );
      continue;
    }
    const finish = getFinish(parsed.finish).id;
    const frame: FrameColor =
      parsed.frame && parsed.frame !== "none" && FRAME_STYLES[finish].colors.includes(parsed.frame)
        ? parsed.frame
        : "none";
    const productCode = artbeatProductCode(finish, frame);
    if (!productCode && requireCodes) {
      problems.push(
        `No ArtBeat product code for ${finish}${frame === "none" ? "" : ` with a ${frame} frame`} yet (src/config/artbeat.ts).`,
      );
      continue;
    }
    const size = getPrintSize(parsed.printSize);
    const points = parsed.stops.map((s) => ({
      lng: s.location.longitude,
      lat: s.location.latitude,
    }));
    const parts = planTrip(points, size, parsed.styleId).panels.length;
    const ref = order.name.replace(/[^0-9A-Za-z]/g, "") || order.id;
    const finishInfo = getFinish(finish);
    for (let part = 1; part <= parts; part++) {
      prints.push({
        lineItemId: line.lineItemId,
        part,
        parts,
        quantity: line.quantity,
        design: parsed,
        finish,
        frame,
        productCode,
        size: { width: size.widthIn, height: size.heightIn },
        edge,
        ...fileEdges(edge, finish),
        title: line.title,
        tripName: parsed.title?.trim() || line.title,
        sizeLabel: `${size.label}″`,
        finishLabel: finishInfo.label,
        frameLabel: frameLabel({ finish, frame }),
        fileName: `${ref}-${line.lineItemId}-${part}of${parts}-${edge}.${ARTBEAT.file.format}`,
      });
    }
  }
  return { prints, problems };
}

export interface ArtbeatOrder {
  externalOrderId: string;
  shipTo: Address;
  billTo: Address;
  lines: {
    externalLineId: string;
    productCode: string;
    quantity: number;
    imageUrl: string;
    size: { width: number; height: number; unit: "in" };
  }[];
}

/** The partner API body. Never carries a price: ArtBeat prices from our vendor tier. */
export function buildArtbeatOrder(
  order: ShopifyOrder,
  prints: PrintJob[],
  imageUrl: (p: PrintJob) => string,
): ArtbeatOrder {
  if (!order.shipTo) throw new Error("The order has no shipping address.");
  return {
    externalOrderId: order.id,
    shipTo: order.shipTo,
    billTo: order.billTo ?? order.shipTo,
    lines: prints.map((p) => ({
      externalLineId: `${p.lineItemId}-${p.part}`,
      productCode: p.productCode,
      quantity: p.quantity,
      imageUrl: imageUrl(p),
      size: { width: p.size.width, height: p.size.height, unit: "in" },
    })),
  };
}

export type ArtbeatOutcome =
  | { kind: "accepted"; id: string; hubOrderCreated: boolean }
  | { kind: "rejected"; errors: string[] }
  | { kind: "retry"; reason: string };

/** What ArtBeat's answer means: done, needs a person, or try again later. */
export function readArtbeatResponse(status: number, body: unknown): ArtbeatOutcome {
  const b = (body ?? {}) as {
    id?: string;
    status?: string;
    hubOrderCreated?: boolean;
    errors?: { line?: string; reason?: string }[];
    message?: string;
  };
  if ((status === 200 || status === 201) && b.status === "accepted")
    return {
      kind: "accepted",
      id: String(b.id ?? ""),
      hubOrderCreated: b.hubOrderCreated === true,
    };
  if (status === 422 || b.status === "rejected")
    return {
      kind: "rejected",
      errors: (b.errors ?? []).map((e) => `${e.line ?? "-"}: ${e.reason ?? "rejected"}`),
    };
  if (status === 400 || status === 401 || status === 403)
    return { kind: "rejected", errors: [b.message ?? `ArtBeat refused the request (${status}).`] };
  return { kind: "retry", reason: b.message ?? `ArtBeat answered ${status}.` };
}
