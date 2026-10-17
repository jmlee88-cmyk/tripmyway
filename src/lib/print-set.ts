import type { Customization } from "@/types/product";
import {
  SET_PANEL_SEEDS,
  SET_SHARED_FIELDS,
  defaultSubtitle,
  formatCoordinates,
} from "@/config/products";

/**
 * Sets (e.g. a triptych) are plain arrays of Customization — one per panel —
 * so every panel previews, prints and validates exactly like a single design.
 * These helpers keep the shared fields in step across panels.
 */

type SharedKey = (typeof SET_SHARED_FIELDS)[number];
const SHARED = new Set<string>(SET_SHARED_FIELDS);

/** Apply an edit to the active panel; shared fields (style, size…) go to every panel. */
export function applyPanelPatch(
  panels: Customization[],
  active: number,
  patch: Partial<Customization>,
): Customization[] {
  const shared: Partial<Customization> = {};
  const own: Partial<Customization> = {};
  for (const [k, v] of Object.entries(patch) as [keyof Customization, unknown][]) {
    (SHARED.has(k) ? shared : own)[k as never] = v as never;
  }
  return panels.map((p, i) => ({ ...p, ...shared, ...(i === active ? own : {}) }));
}

/** Copy the shared fields from `from` onto `to`. */
export function withSharedFields(to: Customization, from: Customization): Customization {
  const next = { ...to };
  for (const k of SET_SHARED_FIELDS) (next as Record<SharedKey, unknown>)[k] = from[k];
  return next;
}

/**
 * Make sure there are at least `count` panels. Existing panels are kept (so
 * switching between single and set never loses work); new ones start from a
 * seed place and title, with the first panel's shared fields.
 */
export function ensurePanels(panels: Customization[], count: number): Customization[] {
  const first = panels[0]!;
  const out = [...panels];
  for (let i = out.length; i < count; i++) {
    const seed = SET_PANEL_SEEDS[(i - 1) % SET_PANEL_SEEDS.length]!;
    const loc = seed.location!;
    out.push({
      ...first,
      ...seed,
      subtitle: defaultSubtitle(loc),
      coordinates: formatCoordinates(loc.latitude, loc.longitude),
    });
  }
  return out.map((p) => withSharedFields(p, first));
}

export function panelLabel(index: number, count: number) {
  return count > 1 ? `Panel ${index + 1} of ${count}` : "";
}
