import { useSyncExternalStore } from "react";
import type { CartItem, Customization } from "@/types/product";
import {
  PRODUCT_NAME,
  SET_PRODUCT_NAME,
  formatPrice,
  frameLabel,
  getFrame,
  getFinish,
  getPrintSize,
} from "@/config/products";
import { getMapStyle } from "@/config/map-styles";
import { track } from "./analytics";

/**
 * Cart abstraction (localStorage for MVP).
 * SHOPIFY INTEGRATION POINT: replace the bodies of addToCart / removeFromCart /
 * updateQuantity with calls to /cart/add.js, /cart/change.js using the size's
 * variant ID, and pass `toLineItemProperties(item.customization)` as `properties`.
 */
const KEY = "tripmyway-cart-v1";
let items: CartItem[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const EMPTY: CartItem[] = [];

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    items = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    items = [];
  }
}
function commit(next: CartItem[]) {
  items = next;
  localStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((l) => l());
}

export function validateCustomization(c: Customization): string[] {
  const errors: string[] = [];
  if (!c.location) errors.push("Choose a location for your map.");
  if (!c.styleId) errors.push("Select a map style.");
  if (!c.title.trim()) errors.push("Add a title for your print.");
  if (!c.printSize) errors.push("Choose a print size.");
  return errors;
}

/** Errors for every panel of a set, prefixed with the panel number. */
export function validatePanels(panels: Customization[]): string[] {
  if (panels.length === 1) return validateCustomization(panels[0]!);
  return panels.flatMap((p, i) => validateCustomization(p).map((e) => `Panel ${i + 1}: ${e}`));
}

/** Add a single design, or a set (an array of panels) as one line item. */
export function addToCart(design: Customization | Customization[]): CartItem {
  load();
  const panels = Array.isArray(design) ? design : [design];
  const first = panels[0]!;
  const size = getPrintSize(first.printSize);
  const isSet = panels.length > 1;
  const finish = getFinish(first.finish).id;
  const frame = getFrame(first);
  const price = formatPrice(size.id, panels.length, finish, frame);
  const item: CartItem = {
    id: crypto.randomUUID(),
    name: `${isSet ? SET_PRODUCT_NAME : PRODUCT_NAME} — ${getMapStyle(first.styleId).name}`,
    customization: structuredClone(first),
    ...(isSet ? { panels: structuredClone(panels) } : {}),
    price,
    quantity: 1,
    addedAt: Date.now(),
  };
  commit([...items, item]);
  track("add_to_cart", {
    style: first.styleId,
    size: size.id,
    finish,
    price,
    panels: panels.length,
  });
  return item;
}

/** Add a ready-made item (trip prints are built in src/lib/trip-cart.ts). */
export function addCartItem(item: CartItem): CartItem {
  load();
  commit([...items, item]);
  return item;
}

/** The panels of a cart item: one for a single print, several for a set. */
export function itemPanels(item: CartItem): Customization[] {
  return item.panels?.length ? item.panels : [item.customization];
}

export function removeFromCart(id: string) {
  load();
  commit(items.filter((i) => i.id !== id));
}

/** All cart items right now (outside React). */
export function getCartItems(): CartItem[] {
  load();
  return items;
}

/** Record the stored preview image for an item. */
export function setItemPreview(id: string, previewUrl: string) {
  load();
  if (items.some((i) => i.id === id && i.previewUrl !== previewUrl))
    commit(items.map((i) => (i.id === id ? { ...i, previewUrl } : i)));
}

/** Remove several items at once (e.g. after they were bought). */
export function removeItems(ids: string[]) {
  load();
  const drop = new Set(ids);
  if (items.some((i) => drop.has(i.id))) commit(items.filter((i) => !drop.has(i.id)));
}

export function updateQuantity(id: string, quantity: number) {
  load();
  commit(
    items.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, Math.min(10, quantity)) } : i)),
  );
}

/**
 * Flattened key/values for Shopify line-item properties. A set lists the shared
 * fields once and each panel's own fields prefixed "Panel N".
 */
export function itemLineItemProperties(item: CartItem): Record<string, string> {
  const panels = itemPanels(item);
  if (panels.length === 1) return toLineItemProperties(panels[0]!);
  const shared = toLineItemProperties(panels[0]!);
  const out: Record<string, string> = {
    Format: `Set of ${panels.length}`,
    Style: shared["Style"]!,
    Marker: shared["Marker"]!,
    Layout: shared["Layout"]!,
    Size: shared["Size"]!,
    Finish: shared["Finish"]!,
    Frame: shared["Frame"]!,
  };
  panels.forEach((p, i) => {
    for (const [k, v] of Object.entries(toLineItemProperties(p))) {
      if (!(k in out)) out[`Panel ${i + 1} ${k}`] = v;
    }
  });
  return out;
}

export function toLineItemProperties(c: Customization): Record<string, string> {
  return {
    Location: c.location?.formattedAddress ?? "",
    Latitude: String(c.location?.latitude ?? ""),
    Longitude: String(c.location?.longitude ?? ""),
    Style: getMapStyle(c.styleId).name,
    Title: c.title,
    Subtitle: c.subtitle,
    Date: c.date,
    Coordinates: c.showCoordinates ? c.coordinates : "",
    Zoom: c.zoomLevel,
    Marker: c.markerStyle,
    Layout: c.layout === "fullBleed" ? "Edge to edge" : "With margin",
    Size: getPrintSize(c.printSize).label,
    Finish: getFinish(c.finish).label,
    // Only framed orders carry a Frame line (shown at checkout, thank-you page and emails).
    Frame: getFrame(c) === "none" ? "" : frameLabel(c),
  };
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useCart(): CartItem[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return items;
    },
    () => EMPTY,
  );
}

export function cartCount(list: CartItem[]) {
  return list.reduce((n, i) => n + i.quantity, 0);
}
export function cartSubtotal(list: CartItem[]) {
  return list.reduce((n, i) => n + i.price * i.quantity, 0);
}
