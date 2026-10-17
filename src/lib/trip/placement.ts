import { TRIP_LAYOUT, cqwToIn } from "@/components/poster/poster-layout";

/**
 * PHOTO PLACEMENT for layout B ("photos on the map"): each stop's photo sits
 * in a circle beside its marker, joined by a dotted leader, with the stop's
 * name underneath. Stops without a photo get just their name beside the marker.
 *
 * Deterministic (never AI): for each stop, try spots round its marker (nearer
 * and pointing away from the route first) and take the best one that stays
 * inside the map and clear of every marker, the route, and the photos and
 * names already placed. If any stop can't be placed, try smaller photos; if
 * that fails too, the print falls back to the photo strip (layout A).
 * All lengths are inches in the map window, origin top-left.
 */

export interface Pt {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacementInput {
  mapIn: { w: number; h: number };
  /** Stop markers, in travel order (the route joins them in this order). */
  positionsIn: Pt[];
  markerIn: number;
  /** Print width, for converting layout sizes to inches. */
  widthIn: number;
  stops: { label: string; hasPhoto: boolean }[];
  /** Areas photos and names must stay out of, e.g. the whole-trip overview inset. */
  obstacles?: Box[];
}

export interface PlacedSlot {
  /** Stop index. */
  index: number;
  /** Photo circle centre and radius (radius 0: name only, no photo). */
  center: Pt;
  r: number;
  label: Box;
  /** Dotted leader from the marker's edge to the photo's edge; null for name-only stops. */
  leader: { from: Pt; to: Pt } | null;
}

export type Placement =
  { mode: "map"; photoIn: number; slots: PlacedSlot[] } | { mode: "strip"; reason: string };

const DIRECTIONS = 16;
const DISTANCES = [1, 1.35, 1.75, 2.2];
/** Score weight for pointing away from the preferred direction, per radian. */
const TURN_COST = 0.35;
/** Score cost of a leader crossing the route (allowed, but avoided when possible). */
const CROSSING_COST = 1.5;

export function placePhotos(input: PlacementInput): Placement {
  const { positionsIn: pos, stops, widthIn } = input;
  if (pos.length !== stops.length) throw new RangeError("One stop per marker position.");
  const full = cqwToIn(TRIP_LAYOUT.photo.diameter, widthIn);
  for (const step of TRIP_LAYOUT.photo.shrinkSteps) {
    const photoIn = Math.max(TRIP_LAYOUT.photo.minIn, full * step);
    if (step !== 1 && photoIn >= full - 1e-9) continue;
    const slots = tryPlace(input, photoIn);
    if (slots) return { mode: "map", photoIn, slots };
    if (photoIn <= TRIP_LAYOUT.photo.minIn + 1e-9) break;
  }
  return {
    mode: "strip",
    reason: "Stops are too close together to place every photo beside its marker.",
  };
}

function tryPlace(input: PlacementInput, photoIn: number): PlacedSlot[] | null {
  const { mapIn, positionsIn: pos, markerIn, widthIn, stops } = input;
  const mR = markerIn / 2;
  const clear = cqwToIn(TRIP_LAYOUT.clearance, widthIn);
  const gap = cqwToIn(TRIP_LAYOUT.leaderGap, widthIn);
  const L = TRIP_LAYOUT.photo.label;
  const fontIn = cqwToIn(L.size, widthIn);
  const labelH = fontIn * L.lineHeight;
  const labelGap = cqwToIn(L.gap, widthIn);
  const route = pos.slice(1).map((p, i) => [pos[i]!, p] as const);
  const bounds: Box = { x: 0, y: 0, w: mapIn.w, h: mapIn.h };

  // Most crowded stops first: they have the fewest good spots.
  const crowd = pos.map((p) => pos.filter((q) => dist(p, q) < photoIn * 3).length);
  const order = pos.map((_, i) => i).sort((a, b) => crowd[b]! - crowd[a]! || a - b);

  const placed: PlacedSlot[] = [];
  for (const i of order) {
    const m = pos[i]!;
    const r = stops[i]!.hasPhoto ? photoIn / 2 : 0;
    const labelW = Math.max(2 * r, stops[i]!.label.length * L.charWidth * fontIn);
    const reach = mR + gap + (r > 0 ? r : labelH / 2 + clear);
    const prefer = preferredDirection(pos, i, mapIn);

    let best: { slot: PlacedSlot; score: number } | null = null;
    for (const k of DISTANCES) {
      for (let d = 0; d < DIRECTIONS; d++) {
        const a = (2 * Math.PI * d) / DIRECTIONS;
        const dir = { x: Math.cos(a), y: Math.sin(a) };
        const c = { x: m.x + dir.x * reach * k, y: m.y + dir.y * reach * k };
        const label: Box =
          r > 0
            ? { x: c.x - labelW / 2, y: c.y + r + labelGap, w: labelW, h: labelH }
            : { x: c.x - labelW / 2, y: c.y - labelH / 2, w: labelW, h: labelH };
        const leader =
          r > 0
            ? {
                from: { x: m.x + dir.x * mR, y: m.y + dir.y * mR },
                to: { x: c.x - dir.x * r, y: c.y - dir.y * r },
              }
            : null;
        const slot: PlacedSlot = { index: i, center: c, r, label, leader };
        if (!fitsInside(slot, bounds, clear)) continue;
        if (collides(slot, i, pos, mR, route, placed, clear, input.obstacles ?? [])) continue;
        const crossings = slot.leader
          ? route.filter(
              ([a, b]) => a !== m && b !== m && segsCross(slot.leader!.from, slot.leader!.to, a, b),
            ).length
          : 0;
        const score = k + TURN_COST * angleBetween(dir, prefer) + CROSSING_COST * crossings;
        if (!best || score < best.score - 1e-9) best = { slot, score };
      }
    }
    if (!best) return null;
    placed.push(best.slot);
  }
  return placed.sort((a, b) => a.index - b.index);
}

/** Away from the route at this stop; for a lone stop, away from the map's centre. */
function preferredDirection(pos: Pt[], i: number, mapIn: { w: number; h: number }): Pt {
  const m = pos[i]!;
  let x = 0,
    y = 0;
  for (const j of [i - 1, i + 1]) {
    const q = pos[j];
    if (!q) continue;
    const d = dist(m, q);
    if (d > 1e-9) {
      x -= (q.x - m.x) / d;
      y -= (q.y - m.y) / d;
    }
  }
  if (Math.hypot(x, y) < 1e-6) {
    x = m.x - mapIn.w / 2;
    y = m.y - mapIn.h / 2;
  }
  const n = Math.hypot(x, y);
  return n < 1e-6 ? { x: 0, y: -1 } : { x: x / n, y: y / n };
}

function fitsInside(s: PlacedSlot, b: Box, clear: number) {
  const { center: c, r, label } = s;
  if (
    r > 0 &&
    (c.x - r < b.x + clear ||
      c.x + r > b.x + b.w - clear ||
      c.y - r < b.y + clear ||
      c.y + r > b.y + b.h - clear)
  )
    return false;
  return boxInside(label, b, clear);
}

function collides(
  s: PlacedSlot,
  own: number,
  pos: Pt[],
  mR: number,
  route: (readonly [Pt, Pt])[],
  placed: PlacedSlot[],
  clear: number,
  obstacles: Box[],
) {
  const label = grow(s.label, clear);
  for (const ob of obstacles) {
    if (s.r > 0 && circleBox(s.center, s.r + clear, ob)) return true;
    if (boxesOverlap(label, ob)) return true;
    if (s.leader && segBox(s.leader.from, s.leader.to, ob)) return true;
  }
  // Its own leader must not run through its own name (a photo straight above its marker).
  if (s.leader && segBox(s.leader.from, s.leader.to, s.label)) return true;
  for (let j = 0; j < pos.length; j++) {
    const p = pos[j]!;
    if (s.r > 0 && dist(p, s.center) < s.r + mR + (j === own ? 0 : clear)) return true;
    if (circleBox(p, mR, label)) return true;
    if (s.leader && j !== own && segCircle(s.leader.from, s.leader.to, p, mR + clear)) return true;
  }
  for (const [a, b] of route) {
    if (s.r > 0 && segCircle(a, b, s.center, s.r + clear)) return true;
    if (segBox(a, b, label)) return true;
  }
  for (const o of placed) {
    if (s.r > 0 && o.r > 0 && dist(s.center, o.center) < s.r + o.r + clear) return true;
    if (o.r > 0 && circleBox(o.center, o.r + clear, s.label)) return true;
    if (s.r > 0 && circleBox(s.center, s.r + clear, o.label)) return true;
    if (boxesOverlap(label, o.label)) return true;
    if (s.leader && o.r > 0 && segCircle(s.leader.from, s.leader.to, o.center, o.r + clear))
      return true;
    if (s.leader && segBox(s.leader.from, s.leader.to, grow(o.label, clear))) return true;
    if (o.leader && s.r > 0 && segCircle(o.leader.from, o.leader.to, s.center, s.r + clear))
      return true;
    if (o.leader && segBox(o.leader.from, o.leader.to, label)) return true;
  }
  return false;
}

// ── Geometry ──

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function angleBetween(a: Pt, b: Pt) {
  return Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y)));
}

function grow(b: Box, by: number): Box {
  return { x: b.x - by, y: b.y - by, w: b.w + 2 * by, h: b.h + 2 * by };
}

function boxInside(inner: Box, outer: Box, margin: number) {
  return (
    inner.x >= outer.x + margin &&
    inner.y >= outer.y + margin &&
    inner.x + inner.w <= outer.x + outer.w - margin &&
    inner.y + inner.h <= outer.y + outer.h - margin
  );
}

export function boxesOverlap(a: Box, b: Box) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function circleBox(c: Pt, r: number, b: Box) {
  const nx = Math.max(b.x, Math.min(c.x, b.x + b.w));
  const ny = Math.max(b.y, Math.min(c.y, b.y + b.h));
  return Math.hypot(c.x - nx, c.y - ny) < r;
}

export function segCircle(a: Pt, b: Pt, c: Pt, r: number) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2));
  return Math.hypot(a.x + t * dx - c.x, a.y + t * dy - c.y) < r;
}

/** Do segments a→b and c→d cross? */
export function segsCross(a: Pt, b: Pt, c: Pt, d: Pt) {
  const o = (p: Pt, q: Pt, r: Pt) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

/** Does segment a→b pass through box b (Liang–Barsky clip)? */
export function segBox(a: Pt, b: Pt, box: Box) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  let t0 = 0,
    t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - box.x],
    [dx, box.x + box.w - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.h - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}
