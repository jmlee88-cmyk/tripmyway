import type { TripDesign } from "@/types/trip";

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
