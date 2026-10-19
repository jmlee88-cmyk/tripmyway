import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { TripDesign, TripStop } from "@/types/trip";
import { autoTripLine, breakText, formatKm, renderTripPdf } from "./render-trip-pdf";

/**
 * Trip prints against an empty tile server (the real one is not reachable from
 * CI): checks pages, photos and metadata, not cartography.
 */

const emptyTiles = async (url: string) =>
  url.endsWith("/planet")
    ? new Response(
        JSON.stringify({ tiles: ["https://tiles.test/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14 }),
      )
    : new Response(null, { status: 204 });

const loadFont = async (file: string) =>
  new Uint8Array(readFileSync(join(process.cwd(), "public/fonts/print", file)));

// A 1 × 1 PNG.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

const stop = (
  label: string,
  lng: number,
  lat: number,
  extra: Partial<TripStop> = {},
): TripStop => ({
  id: label,
  label,
  location: { id: label, name: label, formattedAddress: label, latitude: lat, longitude: lng },
  ...extra,
});

const ITALY: TripDesign = {
  title: "Italy 2026",
  styleId: "modern-minimal",
  printSize: "18x24",
  stops: [
    stop("Milan", 9.19, 45.4642, { date: "Jun 3" }),
    stop("Lake Como", 9.085, 45.81),
    stop("Venice", 12.3155, 45.4408, {
      photo: { key: "venice", url: "https://photos.test/venice.png", widthPx: 1, heightPx: 1 },
    }),
    stop("Florence", 11.2558, 43.7696),
    stop("Cinque Terre", 9.7385, 44.0994),
    stop("Rome", 12.4964, 41.9028),
    stop("Amalfi", 14.6027, 40.634, { date: "Jun 18" }),
  ],
};

const PACIFIC: TripDesign = {
  title: "California to Japan",
  styleId: "modern-minimal",
  printSize: "18x24",
  stops: [
    stop("Los Angeles", -118.24, 34.05),
    stop("Santa Barbara", -119.7, 34.42),
    stop("San Francisco", -122.42, 37.77),
    stop("Tokyo", 139.77, 35.68),
    stop("Kyoto", 135.77, 35.01),
    stop("Osaka", 135.5, 34.69),
  ],
};

describe("renderTripPdf", () => {
  it("prints a trip that fits as one page at the physical size, with its photo", async () => {
    const loaded: string[] = [];
    const res = await renderTripPdf(ITALY, {
      loadFont,
      fetcher: emptyTiles,
      bleedIn: 0.125,
      loadPhoto: async (p) => {
        loaded.push(p.key);
        return PNG;
      },
    });
    expect(res.pages).toBe(1);
    expect(loaded).toEqual(["venice"]);
    expect(res.placements[0]!.mode).toBe("map");
    const pdf = await PDFDocument.load(res.bytes);
    expect(pdf.getPageCount()).toBe(1);
    const page = pdf.getPage(0);
    expect(page.getWidth()).toBeCloseTo((18 + 0.25) * 72);
    expect(page.getHeight()).toBeCloseTo((24 + 0.25) * 72);
    expect(pdf.getTitle()).toBe("Italy 2026");
    expect(pdf.getKeywords()).toContain("stops:7");
    expect(res.fileName).toBe("italy-2026_modern-minimal_18x24.pdf");
  });

  it("prints a split trip as one page per print", async () => {
    const res = await renderTripPdf(PACIFIC, {
      loadFont,
      fetcher: emptyTiles,
      placeholderPhotos: true,
    });
    expect(res.pages).toBe(2);
    expect(res.plan.breaks).toHaveLength(1);
    expect((await PDFDocument.load(res.bytes)).getPageCount()).toBe(2);
    expect(res.fileName).toContain("_2-prints");
  });
});

describe("trip text", () => {
  const ITALY_STOPS = ITALY.stops;
  it("writes the trip line", () => {
    expect(autoTripLine(ITALY_STOPS, 0, 1, 0)).toBe("Milan → Amalfi · 7 stops · Jun 3 – Jun 18");
    expect(autoTripLine(PACIFIC.stops.slice(3), 1, 2, 3, { arrows: false, approx: false })).toBe(
      "Part 2 of 2 · Tokyo to Osaka · stops 4–6",
    );
  });
  it("names the place on a location map and skips the count from A to B", () => {
    expect(autoTripLine(ITALY_STOPS.slice(5, 6), 0, 1, 0)).toBe("Rome");
    expect(autoTripLine(ITALY_STOPS.slice(0, 1), 0, 1, 0)).toBe("Milan · Jun 3");
    expect(autoTripLine(ITALY_STOPS.slice(5, 7), 0, 1, 0)).toBe("Rome → Amalfi · Jun 18");
  });
  it("writes break marks, with words when the font lacks the symbols", () => {
    expect(breakText("to", "Tokyo", 8266, { arrows: true, approx: true })).toBe(
      "≈ 8,300 KM TO TOKYO →",
    );
    expect(breakText("from", "San Francisco", 8266, { arrows: false, approx: false })).toBe(
      "FROM SAN FRANCISCO · ABOUT 8,300 KM",
    );
    expect(formatKm(742)).toBe("740");
  });
});
