import type { FrameColor, PrintFinish, PrintSizeId } from "@/types/product";
import { getPrintSize } from "./products";

/**
 * GUIDES — the advice shown while customers choose size, finish and frame
 * (TripEditor). Copy only; prices and dimensions stay in products.ts.
 */

export interface SizeGuide {
  /** One line: what this size is for. */
  goodFor: string;
  /** Where it looks right, and the furniture width it suits. */
  placement: string;
  /** How close people will stand to it. */
  viewing: string;
}

/**
 * Rule of thumb behind these: art over furniture looks right at about two
 * thirds of the furniture's width, hung 8–10″ above it.
 */
export const SIZE_GUIDES: Record<PrintSizeId, SizeGuide> = {
  "8x10": {
    goodFor: "A keepsake for a desk, shelf or bedside table, or a gift.",
    placement: "Lean it on a shelf or desk, or add it to a gallery wall with other frames.",
    viewing: "Best seen up close, within arm's reach.",
  },
  "12x18": {
    goodFor: "Hallways, a home office, beside a bookcase or above a small side table.",
    placement: "Hang it at eye level on a narrow wall, or use a pair above a 30–36″ console.",
    viewing: "Reads well from a few steps away.",
  },
  "18x24": {
    goodFor: "The all-rounder: above a dresser, entry table or nightstand.",
    placement: "Suits furniture about 30–40″ wide, or a wall of its own in a bedroom or office.",
    viewing: "Readable across a small room; photos and labels stay clear.",
  },
  "24x36": {
    goodFor: "A statement piece above a loveseat, a queen bed or a sideboard.",
    placement: "Suits furniture about 40–60″ wide, or as the focal point of a dining room.",
    viewing: "Made to be seen from across the room.",
  },
  "32x48": {
    goodFor: "A centrepiece for a living room or a large, open wall.",
    placement: "Suits a full sofa or king bed (60″ wide and up); great with high ceilings.",
    viewing: "Shows the whole trip in fine detail, even from a distance.",
  },
};

/** Gap left between prints of a set on the wall (also used in the scale sketch). */
export const SET_GAP_IN = 2;

/** Total width on the wall of `prints` prints of this size, gaps included. */
export function wallWidthIn(sizeId: PrintSizeId, prints: number) {
  return prints * getPrintSize(sizeId).widthIn + (prints - 1) * SET_GAP_IN;
}

/** The sofa the scale sketch draws each size above (a typical 3-seat sofa). */
export const SCALE_SOFA = { widthIn: 84, heightIn: 34, gapAboveIn: 9 };

/** Pro tips: what each finish is ideal for, shown under its description. */
export const FINISH_TIPS: Record<PrintFinish, string> = {
  paper:
    "The most flexible choice. Add one of our frames, or use your own frame and mat. Ideal for bedrooms, studies and gifts.",
  canvas:
    "Warm, textured and glare-free, with no glass to reflect windows. Ideal over a sofa or in a living room, and an easy gift because it arrives ready to hang.",
  metal:
    "Modern, durable and easy to wipe clean, and it handles humidity well. Ideal for kitchens, bathrooms and offices; bright light makes it glow.",
  acrylic:
    "The most vivid, gallery-like look, with real depth. Ideal as a statement piece in a well-lit room. Avoid a spot facing a bright window, as the glossy face reflects.",
};

/** Pro tips for each frame choice, shown under the frame buttons. */
export const FRAME_TIPS: Record<FrameColor, string> = {
  none: "",
  white:
    "Crisp and airy. Lets the map's pale tones and your photos lead; lovely on light walls and in coastal or Scandinavian rooms.",
  black:
    "Sharp and graphic. Frames the route like a gallery piece and adds contrast, especially on white or light walls.",
  natural:
    "Warm wood grain that softens the map. Suits travel-journal, mid-century and boho rooms.",
  gold: "Classic and a little celebratory. Lovely for honeymoons and anniversary trips, and with warm-toned map styles.",
  silver: "Cool and refined. Pairs with modern rooms, greys and blues, and cool-toned map styles.",
};

/** What "No frame" means for each finish. */
export const NO_FRAME_TIPS: Record<PrintFinish, string> = {
  paper:
    "Unframed paper is ready for your own frame or mat. Pick a colour to see how one of ours changes the piece.",
  canvas:
    "Canvas looks finished on its own: the map wraps around its 1.5″ sides. A float frame adds a crisp outline and a shadow gap.",
  metal:
    "Metal floats off the wall on its hidden mount for a clean, modern look. A float frame adds a crisp outline.",
  acrylic:
    "Acrylic floats off the wall on its hidden mount for a clean, modern look. A float frame adds a crisp outline.",
};
