import type { CartItem, Customization } from "@/types/product";
import type { TripDesign } from "@/types/trip";
import {
  DEFAULT_CUSTOMIZATION,
  PRINT_FORMATS,
  frameLabel,
  formatPrice,
  getFinish,
  getFrame,
  getPrintSize,
} from "@/config/products";
import { getMapStyle } from "@/config/map-styles";
import { SHOPIFY } from "@/config/shopify";
import { TRIP } from "@/config/trip";
import { planTrip } from "@/lib/trip/plan";
import { photoProblems } from "@/lib/trip/photos";
import { addCartItem } from "@/lib/cart";
import { track } from "@/lib/analytics";

/**
 * TRIP PRINTS IN THE CART. Added alongside the single-print cart: a trip is
 * one line item whose Shopify product follows how many prints the trip needs
 * at its size (1, a set of 2 or a set of 3; decided by the deterministic plan
 * in src/lib/trip/plan.ts), priced per print like every other set.
 */

export const TRIP_PRODUCT_NAME = "Trip map print";
/** A "trip" of one place. */
export const LOCATION_PRODUCT_NAME = "Location map print";

/** Finish and frame of a trip, with defaults filled in. */
export function printOptions(design: TripDesign) {
  return { finish: getFinish(design.finish).id, frame: design.frame ?? ("none" as const) };
}

/** How many prints the trip needs at its size. */
export function tripPrintCount(design: TripDesign): number {
  const points = design.stops.map((s) => ({ lng: s.location.longitude, lat: s.location.latitude }));
  return planTrip(points, getPrintSize(design.printSize), design.styleId).panels.length;
}

export function tripPrice(design: TripDesign, prints = tripPrintCount(design)): number {
  const frame = getFrame(printOptions(design));
  return formatPrice(design.printSize, prints, getFinish(design.finish).id, frame);
}

/** What still stops this trip being ordered (empty when it's ready). */
export function validateTrip(design: TripDesign): string[] {
  const errors: string[] = [];
  if (design.stops.length === 0) errors.push("Add at least one stop.");
  if (design.stops.length > TRIP.maxStops)
    errors.push(`A trip print holds up to ${TRIP.maxStops} stops.`);
  if (!design.title.trim()) errors.push("Give your trip a name.");
  const small = photoProblems(design.stops, design.printSize);
  if (small.length)
    errors.push(
      `The photo for ${small.join(" and ")} is too small for ${getPrintSize(design.printSize).label} in. Choose a smaller size or another photo.`,
    );
  return errors;
}

/** A single-print stand-in for code that reads `item.customization`. */
function standIn(design: TripDesign): Customization {
  const first = design.stops[0]!;
  return {
    ...DEFAULT_CUSTOMIZATION,
    location: first.location,
    styleId: design.styleId,
    title: design.title,
    subtitle: design.stops.map((s) => s.label).join(" to "),
    date: "",
    printSize: design.printSize,
    ...(design.finish ? { finish: design.finish } : {}),
    ...(design.frame ? { frame: design.frame } : {}),
  };
}

export function addTripToCart(design: TripDesign): CartItem {
  const errors = validateTrip(design);
  if (errors.length) throw new Error(errors[0]);
  const prints = tripPrintCount(design);
  const price = tripPrice(design, prints);
  const item: CartItem = {
    id: crypto.randomUUID(),
    name: `${design.stops.length === 1 ? LOCATION_PRODUCT_NAME : TRIP_PRODUCT_NAME} — ${getMapStyle(design.styleId).name}`,
    customization: standIn(design),
    trip: structuredClone(design),
    tripPrints: prints,
    price,
    quantity: 1,
    addedAt: Date.now(),
  };
  addCartItem(item);
  track("add_to_cart", {
    style: design.styleId,
    size: design.printSize,
    finish: getFinish(design.finish).id,
    price,
    panels: prints,
  });
  return item;
}

/** The trip as stored on the order: places, words, photos (by URL) and print options. */
export function compactTrip(design: TripDesign) {
  return {
    title: design.title,
    ...(design.subtitle ? { subtitle: design.subtitle } : {}),
    styleId: design.styleId,
    printSize: design.printSize,
    finish: getFinish(design.finish).id,
    frame: getFrame(printOptions(design)),
    stops: design.stops.map((s) => ({
      id: s.id,
      label: s.label,
      ...(s.date ? { date: s.date } : {}),
      location: {
        id: s.location.id,
        name: s.location.name,
        formattedAddress: s.location.formattedAddress,
        latitude: s.location.latitude,
        longitude: s.location.longitude,
      },
      ...(s.photo ? { photo: s.photo } : {}),
    })),
  };
}

/** Readable order details (shown at checkout, on the order and in emails). */
export function tripLineItemProperties(design: TripDesign, prints: number): Record<string, string> {
  const size = getPrintSize(design.printSize);
  const frame = printOptions(design);
  return {
    Trip: design.title,
    Stops: design.stops
      .map((s, i) => `${i + 1}. ${s.label}${s.date ? ` (${s.date})` : ""}`)
      .join("; "),
    Photos: `${design.stops.filter((s) => s.photo).length} of ${design.stops.length} stops`,
    Format:
      design.stops.length === 1
        ? "Location map"
        : prints === 1
          ? "Single print"
          : `Set of ${prints}`,
    Style: getMapStyle(design.styleId).name,
    Size: `${size.label} in${prints > 1 ? " each" : ""}`,
    Finish: getFinish(design.finish).label,
    Frame: getFrame(frame) === "none" ? "" : frameLabel(frame),
  };
}

/** The Shopify line for a trip item. `_design` lets the print studio redraw it exactly. */
export function tripCheckoutLine(item: CartItem) {
  const design = item.trip!;
  // Re-derive the print count: the plan is deterministic, so this matches what the customer saw.
  const prints = tripPrintCount(design);
  const format = PRINT_FORMATS.find((f) => f.panels === prints)?.id ?? "triptych";
  const finish = getFinish(design.finish).id;
  const framed = getFrame(printOptions(design)) !== "none";
  const merchandiseId = (framed ? SHOPIFY.framedVariants : SHOPIFY.variants)[format][finish][
    design.printSize
  ];
  if (!merchandiseId)
    throw new Error(`No Shopify product for ${format} ${finish} ${design.printSize}`);
  const attributes = Object.entries(tripLineItemProperties(design, prints))
    .filter(([, v]) => v !== "")
    .map(([key, value]) => ({ key, value }));
  if (item.previewUrl) attributes.push({ key: "_preview", value: item.previewUrl });
  attributes.push({ key: "_design", value: JSON.stringify({ v: 2, trip: compactTrip(design) }) });
  return { merchandiseId, quantity: item.quantity, attributes };
}

/** Read a trip back from an order's `_design` (print studio). */
export function parseTripDesign(text: string): TripDesign | string {
  try {
    const raw = JSON.parse(text) as { v?: number; trip?: TripDesign };
    const t = raw.trip;
    if (raw.v !== 2 || !t) return "This isn't a trip design (it has no trip).";
    if (!Array.isArray(t.stops) || t.stops.length === 0) return "The trip has no stops.";
    if (t.stops.some((s) => typeof s.location?.latitude !== "number"))
      return "A stop is missing its location.";
    if (!t.styleId || !t.printSize) return "The trip is missing a style or print size.";
    return t;
  } catch {
    return "That isn't valid JSON.";
  }
}
