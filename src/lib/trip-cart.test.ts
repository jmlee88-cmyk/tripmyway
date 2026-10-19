import { describe, expect, it } from "vitest";
import type { CartItem } from "@/types/product";
import type { TripDesign } from "@/types/trip";
import { SAMPLE_TRIPS } from "@/config/trip-samples";
import { SHOPIFY } from "@/config/shopify";
import { formatPrice } from "@/config/products";
import { toCheckoutLine } from "./checkout";
import {
  compactTrip,
  parseTripDesign,
  tripCheckoutLine,
  tripPrice,
  tripPrintCount,
  validateTrip,
} from "./trip-cart";

const trip = (id: string, extra: Partial<TripDesign> = {}): TripDesign => ({
  ...SAMPLE_TRIPS.find((t) => t.id === id)!.design,
  ...extra,
});
const item = (t: TripDesign): CartItem => ({
  id: "x",
  name: "Trip map print",
  customization: {} as CartItem["customization"],
  trip: t,
  tripPrints: tripPrintCount(t),
  price: tripPrice(t),
  quantity: 1,
  addedAt: 0,
});

describe("trip prints in the cart", () => {
  it("orders a trip that fits as one print on the single product", () => {
    const t = trip("italy");
    expect(tripPrintCount(t)).toBe(1);
    expect(tripPrice(t)).toBe(formatPrice("18x24", 1));
    const line = toCheckoutLine(item(t));
    expect(line.merchandiseId).toBe(SHOPIFY.variants.single.paper["18x24"]);
    const attrs = Object.fromEntries(line.attributes.map((a) => [a.key, a.value]));
    expect(attrs["Trip"]).toBe("Italy 2026");
    expect(attrs["Stops"]).toContain("1. Milan (Jun 3)");
    expect(attrs["Format"]).toBe("Single print");
    expect(attrs["Frame"]).toBeUndefined();
  });

  it("orders an ocean-crossing trip as a set of two, priced per print, framed", () => {
    const t = trip("pacific", { finish: "canvas", frame: "black" });
    expect(tripPrintCount(t)).toBe(2);
    expect(tripPrice(t)).toBe(formatPrice("18x24", 2, "canvas", "black"));
    const line = tripCheckoutLine(item(t));
    expect(line.merchandiseId).toBe(SHOPIFY.framedVariants.diptych.canvas["18x24"]);
    const attrs = Object.fromEntries(line.attributes.map((a) => [a.key, a.value]));
    expect(attrs["Format"]).toBe("Set of 2");
    expect(attrs["Frame"]).toBe("Black float frame");
  });

  it("stores the trip with photo links (never image data) so the studio can redraw it", () => {
    const photo = {
      key: "a".repeat(64),
      url: "https://t.test/photos/a.jpg",
      widthPx: 3000,
      heightPx: 2000,
      crop: { x: 0.4, y: 0.5, zoom: 1.5 },
    };
    const t = trip("italy");
    t.stops = t.stops.map((s, i) => (i === 0 ? { ...s, photo } : s));
    const line = tripCheckoutLine(item(t));
    const design = line.attributes.find((a) => a.key === "_design")!.value;
    expect(design.length).toBeLessThan(4000);
    expect(design).not.toContain("data:");
    const back = parseTripDesign(design);
    expect(typeof back).toBe("object");
    expect((back as TripDesign).stops[0]!.photo).toEqual(photo);
    expect((back as TripDesign).stops).toHaveLength(7);
    expect(compactTrip(t).frame).toBe("none");
    expect(parseTripDesign('{"v":1,"panels":[]}')).toMatch(/isn't a trip/);
  });

  it("refuses trips that can't be ordered yet", () => {
    expect(validateTrip({ ...trip("italy"), stops: [] })).toContain("Add at least one stop.");
    const tiny = { key: "k", url: "u", widthPx: 300, heightPx: 200 };
    const t = trip("italy", { printSize: "32x48" });
    t.stops = t.stops.map((s, i) => (i === 2 ? { ...s, photo: tiny } : s));
    expect(validateTrip(t).join(" ")).toMatch(/Venice is too small for 32 × 48/);
  });
});
