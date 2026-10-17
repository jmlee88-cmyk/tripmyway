import { describe, expect, it } from "vitest";
import { PRINT_SIZES } from "@/config/products";
import { TRIP } from "@/config/trip";
import { haversineKm, unwrapLongitudes } from "./geo";
import { fitStops } from "./fit";
import { consecutiveSplits, planTrip, plansBySize } from "./plan";
import { type PlacedSlot, boxesOverlap, placePhotos, segBox } from "./placement";

const P = (a: [number, number][]) => a.map(([lng, lat]) => ({ lng, lat }));

const ITALY = P([
  [9.19, 45.4642], // Milan
  [9.085, 45.81], // Lake Como
  [12.3155, 45.4408], // Venice
  [11.2558, 43.7696], // Florence
  [9.7385, 44.0994], // Cinque Terre
  [12.4964, 41.9028], // Rome
  [14.6027, 40.634], // Amalfi
]);
const ITALY_NAMES = ["MILAN", "LAKE COMO", "VENICE", "FLORENCE", "CINQUE TERRE", "ROME", "AMALFI"];
const PACIFIC = P([
  [-118.24, 34.05], // Los Angeles
  [-119.7, 34.42], // Santa Barbara
  [-122.42, 37.77], // San Francisco
  [139.77, 35.68], // Tokyo
  [135.77, 35.01], // Kyoto
  [135.5, 34.69], // Osaka
]);
const USA = P([
  [-74.0, 40.71], // New York
  [-87.63, 41.88], // Chicago
  [-104.99, 39.74], // Denver
  [-112.07, 36.06], // Grand Canyon
  [-115.14, 36.17], // Las Vegas
  [-118.24, 34.05], // Los Angeles
  [-122.42, 37.77], // San Francisco
]);
const S8 = { widthIn: 8, heightIn: 10 };
const S18 = { widthIn: 18, heightIn: 24 };

describe("geo", () => {
  it("frames a trip across the Pacific the short way round", () => {
    const lngs = unwrapLongitudes(PACIFIC.map((p) => p.lng));
    expect(Math.max(...lngs) - Math.min(...lngs)).toBeCloseTo(106.3, 0);
  });
  it("leaves a trip that doesn't cross the date line alone", () => {
    expect(unwrapLongitudes(ITALY.map((p) => p.lng))).toEqual(ITALY.map((p) => p.lng));
  });
  it("measures San Francisco → Tokyo", () => {
    expect(haversineKm(PACIFIC[2]!, PACIFIC[3]!)).toBeGreaterThan(8200);
    expect(haversineKm(PACIFIC[2]!, PACIFIC[3]!)).toBeLessThan(8350);
  });
});

describe("fitStops", () => {
  it("shows a single stop at the closest zoom", () => {
    const f = fitStops([ITALY[0]!], S18, "modern-minimal");
    expect(f.framingZoom).toBeCloseTo(TRIP.maxFramingZoom);
    expect(f.fits).toBe(true);
  });
  it("keeps every stop inside the map window, clear of the edges", () => {
    const f = fitStops(ITALY, S18, "modern-minimal");
    for (const p of f.positionsIn) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(f.mapIn.w);
      expect(p.y).toBeLessThan(f.mapIn.h);
    }
  });
  it("flags a map that would zoom out too far", () => {
    expect(fitStops(USA, S18, "modern-minimal").problems).toContain("too-spread-out");
  });
  it("flags stops whose markers would collide", () => {
    const f = fitStops(
      P([
        [12.4922, 41.8902],
        [12.4923, 41.8902],
        [14.6, 40.6],
      ]),
      S8,
      "x",
    );
    expect(f.problems).toContain("too-close");
  });
  it("flags a mostly-water map when told how much is water", () => {
    const f = fitStops(ITALY, S18, "x", { waterShare: () => 0.9 });
    expect(f.problems).toEqual(["too-much-water"]);
  });
});

describe("planTrip", () => {
  it("lists every way to cut a trip into consecutive legs", () => {
    expect(consecutiveSplits(4, 2)).toEqual([[1], [2], [3]]);
    expect(consecutiveSplits(4, 3)).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
    expect(consecutiveSplits(3, 1)).toEqual([[]]);
  });

  it("fits a 7-stop Italy trip on one 18 × 24 print", () => {
    const plan = planTrip(ITALY, S18, "modern-minimal");
    expect(plan.fits).toBe(true);
    expect(plan.panels).toHaveLength(1);
    expect(plan.overview).toBeNull();
  });

  it("splits California → Japan at the Pacific, with an overview", () => {
    const plan = planTrip(PACIFIC, S18, "modern-minimal");
    expect(plan.fits).toBe(true);
    expect(plan.panels.map((p) => [p.start, p.end])).toEqual([
      [0, 3],
      [3, 6],
    ]);
    expect(plan.breaks).toHaveLength(1);
    expect(plan.breaks[0]!.after).toBe(2);
    expect(plan.breaks[0]!.km).toBeGreaterThan(8000);
    // The overview is centred on the Pacific, not on Greenwich.
    expect(Math.abs(plan.overview!.center.lng)).toBeGreaterThan(150);
  });

  it("splits a coast-to-coast US trip into two even panels, not a lone close-up", () => {
    const plan = planTrip(USA, S18, "modern-minimal");
    expect(plan.fits).toBe(true);
    expect(plan.panels.map((p) => [p.start, p.end])).toEqual([
      [0, 2],
      [2, 7],
    ]);
  });

  it("says from which size a trip fits on one print", () => {
    const bySize = plansBySize(ITALY, PRINT_SIZES, "modern-minimal");
    expect(bySize.map((b) => b.size.id)).toEqual(["8x10", "12x18", "18x24", "24x36", "32x48"]);
    expect(bySize[0]!.plan.panels.length).toBeGreaterThan(1);
    for (const b of bySize.slice(1)) expect(b.plan.panels).toHaveLength(1);
  });

  it("refuses an empty trip or more than the maximum stops", () => {
    expect(() => planTrip([], S18, "x")).toThrow(RangeError);
    expect(() => planTrip([...ITALY, ITALY[0]!], S18, "x")).toThrow(/at most 7/);
  });

  it("is deterministic", () => {
    expect(planTrip(USA, S8, "x")).toEqual(planTrip(USA, S8, "x"));
  });
});

describe("placePhotos", () => {
  const placeItaly = (size = S18, hasPhoto = (_i: number) => true) => {
    const f = fitStops(ITALY, size, "modern-minimal");
    return placePhotos({
      mapIn: f.mapIn,
      positionsIn: f.positionsIn,
      markerIn: f.markerIn,
      widthIn: size.widthIn,
      stops: ITALY_NAMES.map((label, i) => ({ label, hasPhoto: hasPhoto(i) })),
    });
  };

  const assertClean = (slots: PlacedSlot[], mapIn: { w: number; h: number }) => {
    for (const s of slots) {
      expect(s.center.x - s.r).toBeGreaterThanOrEqual(0);
      expect(s.center.y - s.r).toBeGreaterThanOrEqual(0);
      expect(s.center.x + s.r).toBeLessThanOrEqual(mapIn.w);
      expect(s.label.y + s.label.h).toBeLessThanOrEqual(mapIn.h);
      if (s.leader) expect(segBox(s.leader.from, s.leader.to, s.label)).toBe(false);
      for (const o of slots) {
        if (o === s) continue;
        if (s.r && o.r)
          expect(Math.hypot(s.center.x - o.center.x, s.center.y - o.center.y)).toBeGreaterThan(
            s.r + o.r,
          );
        expect(boxesOverlap(s.label, o.label)).toBe(false);
      }
    }
  };

  it("places every Italy photo on the map, at every size", () => {
    for (const size of PRINT_SIZES) {
      const f = fitStops(ITALY, size, "modern-minimal");
      const res = placeItaly(size);
      expect(res.mode, size.id).toBe("map");
      if (res.mode !== "map") continue;
      expect(res.slots.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      assertClean(res.slots, f.mapIn);
    }
  });

  it("gives stops without a photo just their name, no leader", () => {
    const res = placeItaly(S18, (i) => i !== 3);
    expect(res.mode).toBe("map");
    if (res.mode !== "map") return;
    expect(res.slots[3]!.r).toBe(0);
    expect(res.slots[3]!.leader).toBeNull();
    expect(res.slots[2]!.r).toBeGreaterThan(0);
  });

  it("falls back to the photo strip when stops are too crowded for photos", () => {
    const markerIn = 0.4;
    const res = placePhotos({
      mapIn: { w: 7, h: 7 },
      positionsIn: Array.from({ length: 7 }, (_, i) => ({ x: 1 + i * markerIn * 1.3, y: 3.5 })),
      markerIn,
      widthIn: 8,
      stops: ITALY_NAMES.map((label) => ({ label, hasPhoto: true })),
    });
    expect(res.mode).toBe("strip");
  });

  it("is deterministic", () => {
    expect(placeItaly(S8)).toEqual(placeItaly(S8));
  });
});
