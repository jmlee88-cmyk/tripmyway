import type { PrintFinish, PrintFormat, PrintSizeId } from "@/types/product";

/**
 * Shopify (checkout only). TripMyWay has its OWN store, separate from Atlas & Ink.
 * TODO: fill in the store domain, Storefront token and every variant ID below
 * once the TripMyWay store and products exist (placeholders are TODO-…).
 *
 * The site keeps its own cart; at checkout it creates
 * a Shopify cart through the Storefront API and sends the customer to
 * Shopify's checkout. Prices are Shopify's, per variant below.
 *
 * The Storefront access token is PUBLIC by design (it can only read products
 * and create carts) and is safe in the browser. Never put the Admin API token
 * here. Both values can be overridden at build time with
 * VITE_SHOPIFY_STORE_DOMAIN / VITE_SHOPIFY_STOREFRONT_TOKEN.
 */
export const SHOPIFY = {
  storeDomain:
    (import.meta.env["VITE_SHOPIFY_STORE_DOMAIN"] as string | undefined) ??
    "",
  // Public Storefront API token from the TripMyWay store's headless channel. TODO: set once the store exists.
  storefrontToken:
    (import.meta.env["VITE_SHOPIFY_STOREFRONT_TOKEN"] as string | undefined) ??
    "",
  apiVersion: "2026-07",
  /**
   * Product variant per format, finish and size (products: "Personalized Map
   * Print" and "…Set of Three", options Size × Finish). Paper variants are the
   * originals; prices in Shopify match FINISH_PRICES in config/products.ts.
   */
  variants: {
    single: {
      paper: {
        "8x10": "gid://shopify/ProductVariant/TODO-single-paper-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-single-paper-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-single-paper-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-single-paper-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-single-paper-32x48",
      },
      canvas: {
        "8x10": "gid://shopify/ProductVariant/TODO-single-canvas-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-single-canvas-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-single-canvas-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-single-canvas-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-single-canvas-32x48",
      },
      metal: {
        "8x10": "gid://shopify/ProductVariant/TODO-single-metal-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-single-metal-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-single-metal-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-single-metal-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-single-metal-32x48",
      },
      acrylic: {
        "8x10": "gid://shopify/ProductVariant/TODO-single-acrylic-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-single-acrylic-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-single-acrylic-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-single-acrylic-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-single-acrylic-32x48",
      },
    },
    triptych: {
      paper: {
        "8x10": "gid://shopify/ProductVariant/TODO-triptych-paper-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-triptych-paper-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-triptych-paper-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-triptych-paper-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-triptych-paper-32x48",
      },
      canvas: {
        "8x10": "gid://shopify/ProductVariant/TODO-triptych-canvas-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-triptych-canvas-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-triptych-canvas-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-triptych-canvas-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-triptych-canvas-32x48",
      },
      metal: {
        "8x10": "gid://shopify/ProductVariant/TODO-triptych-metal-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-triptych-metal-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-triptych-metal-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-triptych-metal-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-triptych-metal-32x48",
      },
      acrylic: {
        "8x10": "gid://shopify/ProductVariant/TODO-triptych-acrylic-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-triptych-acrylic-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-triptych-acrylic-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-triptych-acrylic-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-triptych-acrylic-32x48",
      },
    },
  } satisfies Record<PrintFormat, Record<PrintFinish, Record<PrintSizeId, string>>>,
  /**
   * The same with a frame (Shopify option Frame = "Box frame" for paper,
   * "Float frame" otherwise; the colour travels as the "Frame" line detail).
   * Prices = finish price + FRAME_PRICES in config/products.ts.
   */
  framedVariants: {
    single: {
      paper: {
        "8x10": "gid://shopify/ProductVariant/TODO-framed-single-paper-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-framed-single-paper-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-framed-single-paper-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-framed-single-paper-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-framed-single-paper-32x48",
      },
      canvas: {
        "8x10": "gid://shopify/ProductVariant/TODO-framed-single-canvas-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-framed-single-canvas-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-framed-single-canvas-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-framed-single-canvas-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-framed-single-canvas-32x48",
      },
      metal: {
        "8x10": "gid://shopify/ProductVariant/TODO-framed-single-metal-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-framed-single-metal-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-framed-single-metal-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-framed-single-metal-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-framed-single-metal-32x48",
      },
      acrylic: {
        "8x10": "gid://shopify/ProductVariant/TODO-framed-single-acrylic-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-framed-single-acrylic-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-framed-single-acrylic-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-framed-single-acrylic-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-framed-single-acrylic-32x48",
      },
    },
    triptych: {
      paper: {
        "8x10": "gid://shopify/ProductVariant/TODO-framed-triptych-paper-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-framed-triptych-paper-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-framed-triptych-paper-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-framed-triptych-paper-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-framed-triptych-paper-32x48",
      },
      canvas: {
        "8x10": "gid://shopify/ProductVariant/TODO-framed-triptych-canvas-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-framed-triptych-canvas-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-framed-triptych-canvas-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-framed-triptych-canvas-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-framed-triptych-canvas-32x48",
      },
      metal: {
        "8x10": "gid://shopify/ProductVariant/TODO-framed-triptych-metal-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-framed-triptych-metal-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-framed-triptych-metal-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-framed-triptych-metal-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-framed-triptych-metal-32x48",
      },
      acrylic: {
        "8x10": "gid://shopify/ProductVariant/TODO-framed-triptych-acrylic-8x10",
        "12x18": "gid://shopify/ProductVariant/TODO-framed-triptych-acrylic-12x18",
        "18x24": "gid://shopify/ProductVariant/TODO-framed-triptych-acrylic-18x24",
        "24x36": "gid://shopify/ProductVariant/TODO-framed-triptych-acrylic-24x36",
        "32x48": "gid://shopify/ProductVariant/TODO-framed-triptych-acrylic-32x48",
      },
    },
  } satisfies Record<PrintFormat, Record<PrintFinish, Record<PrintSizeId, string>>>,
} as const;

export const shopifyConfigured = () => Boolean(SHOPIFY.storefrontToken);
