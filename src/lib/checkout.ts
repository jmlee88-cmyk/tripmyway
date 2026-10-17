import type { CartItem, Customization } from "@/types/product";
import { SHOPIFY } from "@/config/shopify";
import { getFinish, getFrame } from "@/config/products";
import { itemLineItemProperties, itemPanels, removeItems } from "./cart";

/**
 * SHOPIFY CHECKOUT: turns the site's cart into a Shopify cart (Storefront API
 * cartCreate) and returns Shopify's checkout URL. Each line carries:
 *  - readable design details (shown to the customer and on the order), and
 *  - `_design`: the full design JSON (hidden from the customer; leading
 *    underscore) so the print studio can regenerate the exact print file.
 */

/**
 * Order details the customer doesn't need to see at checkout (the size and
 * format are already in the product line). They stay on the order, hidden,
 * for production.
 */
const HIDDEN = new Set([
  "Latitude",
  "Longitude",
  "Zoom",
  "Marker",
  "Size",
  "Format",
  "Subtitle",
  "Coordinates",
]);

export interface CheckoutLine {
  merchandiseId: string;
  quantity: number;
  attributes: { key: string; value: string }[];
}

/** Only what a print needs, to keep the hidden copy small. */
function compact(c: Customization) {
  const { location, ...rest } = c;
  return {
    ...rest,
    location: location && {
      name: location.name,
      formattedAddress: location.formattedAddress,
      latitude: location.latitude,
      longitude: location.longitude,
      city: location.city,
      region: location.region,
      country: location.country,
    },
  };
}

export function toCheckoutLine(item: CartItem): CheckoutLine {
  const panels = itemPanels(item);
  const format = panels.length > 1 ? "triptych" : "single";
  const size = panels[0]!.printSize;
  const finish = getFinish(panels[0]!.finish).id;
  const framed = getFrame(panels[0]!) !== "none";
  const merchandiseId = (framed ? SHOPIFY.framedVariants : SHOPIFY.variants)[format][finish][size];
  if (!merchandiseId)
    throw new Error(`No Shopify product for ${format} ${finish} ${size}${framed ? " framed" : ""}`);
  const attributes = Object.entries(itemLineItemProperties(item))
    .filter(([, v]) => v !== "")
    .map(([k, v]) => {
      const base = k.replace(/^Panel \d+ /, "");
      return { key: HIDDEN.has(base) ? `_${k}` : k, value: v };
    });
  if (item.previewUrl) attributes.push({ key: "_preview", value: item.previewUrl });
  attributes.push({
    key: "_design",
    value: JSON.stringify({ v: 1, panels: panels.map(compact) }),
  });
  return { merchandiseId, quantity: item.quantity, attributes };
}

const CART_CREATE = `mutation CartCreate($input: CartInput!) {
  cartCreate(input: $input) {
    cart { id checkoutUrl }
    userErrors { field message }
  }
}`;

export class CheckoutError extends Error {}

export async function createCheckout(
  items: CartItem[],
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (!SHOPIFY.storefrontToken) throw new CheckoutError("Checkout isn't connected yet.");
  if (items.length === 0) throw new CheckoutError("Your cart is empty.");
  const res = await fetcher(
    `https://${SHOPIFY.storeDomain}/api/${SHOPIFY.apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-storefront-access-token": SHOPIFY.storefrontToken,
      },
      body: JSON.stringify({
        query: CART_CREATE,
        variables: { input: { lines: items.map(toCheckoutLine) } },
      }),
    },
  );
  if (!res.ok) throw new CheckoutError(`Checkout is unavailable right now (${res.status}).`);
  const json = (await res.json()) as {
    data?: {
      cartCreate?: {
        cart?: { id?: string; checkoutUrl?: string };
        userErrors?: { message: string }[];
      };
    };
    errors?: { message: string }[];
  };
  const problems = [...(json.errors ?? []), ...(json.data?.cartCreate?.userErrors ?? [])];
  const url = json.data?.cartCreate?.cart?.checkoutUrl;
  const cartId = json.data?.cartCreate?.cart?.id;
  if (problems.length || !url || !cartId) {
    console.error("Shopify cartCreate failed", problems);
    throw new CheckoutError("We couldn't start checkout. Please try again.");
  }
  rememberCheckout({ cartId, itemIds: items.map((i) => i.id), at: Date.now() });
  return url;
}

/**
 * After payment the customer stays on Shopify, so the site can't be told the
 * order went through. Instead it remembers the Shopify cart it created; Shopify
 * deletes a cart when its order is placed, so on the next visit a missing cart
 * means "bought" and those items leave the site's cart. Items added since stay.
 */
const PENDING_KEY = "tripmyway-checkout-v1";
/**
 * Shopify also deletes abandoned carts after a while, so a missing cart only
 * means "bought" for checkouts started in the last few days. Older ones are
 * forgotten without touching the site cart.
 */
const PENDING_MAX_AGE = 5 * 24 * 60 * 60 * 1000;

interface PendingCheckout {
  cartId: string;
  itemIds: string[];
  at: number;
}

function rememberCheckout(p: PendingCheckout) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: the cart simply isn't auto-cleared */
  }
}

function forgetCheckout() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** Clear items from the site cart whose Shopify checkout was completed. */
export async function reconcileCheckout(fetcher: typeof fetch = fetch): Promise<boolean> {
  let pending: PendingCheckout | null = null;
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as PendingCheckout | null;
  } catch {
    return false;
  }
  if (!pending?.cartId || !SHOPIFY.storefrontToken) return false;
  if (Date.now() - pending.at > PENDING_MAX_AGE) {
    forgetCheckout();
    return false;
  }
  try {
    const res = await fetcher(
      `https://${SHOPIFY.storeDomain}/api/${SHOPIFY.apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-shopify-storefront-access-token": SHOPIFY.storefrontToken,
        },
        body: JSON.stringify({
          query: "query Cart($id: ID!) { cart(id: $id) { id } }",
          variables: { id: pending.cartId },
        }),
      },
    );
    if (!res.ok) return false;
    const json = (await res.json()) as {
      data?: { cart: { id: string } | null };
      errors?: unknown[];
    };
    // Only a clean "no such cart" answer counts as bought; errors change nothing.
    if (json.errors?.length || !json.data || json.data.cart !== null) return false;
    removeItems(pending.itemIds);
    forgetCheckout();
    return true;
  } catch {
    return false;
  }
}
