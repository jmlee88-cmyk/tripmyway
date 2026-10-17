import type { PDFDocument, PDFFont } from "pdf-lib";

/**
 * Print fonts. Static TTF instances of the same open-source (OFL) families the
 * site loads from Google Fonts, Latin-subset, served from /fonts/print. They
 * are embedded in full into each PDF so the printer never substitutes a font.
 */
const FILES: Record<string, Record<number, string>> = {
  Jost: { 300: "Jost-Light.ttf", 400: "Jost-Regular.ttf" },
  "Playfair Display": { 500: "PlayfairDisplay-Medium.ttf" },
  "Cormorant Garamond": {
    400: "CormorantGaramond-Regular.ttf",
    500: "CormorantGaramond-Medium.ttf",
  },
  "IBM Plex Mono": { 400: "IBMPlexMono-Regular.ttf", 500: "IBMPlexMono-Medium.ttf" },
};

export const FONT_BASE_PATH = "/fonts/print/";

export function fontFile(family: string, weight: number): string {
  const weights = FILES[family];
  if (!weights) throw new Error(`No print font for "${family}"`);
  const available = Object.keys(weights).map(Number);
  const nearest = available.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  return weights[nearest]!;
}

export type FontBytesLoader = (file: string) => Promise<Uint8Array>;

/** Vertical metrics (in em) used to place the baseline like a browser does. */
export interface FontMetrics {
  ascent: number;
  descent: number;
}

export interface PrintFont {
  pdf: PDFFont;
  metrics: FontMetrics;
}

export class FontCache {
  private cache = new Map<string, Promise<PrintFont>>();
  constructor(
    private doc: PDFDocument,
    private load: FontBytesLoader,
  ) {}

  get(family: string, weight: number): Promise<PrintFont> {
    const file = fontFile(family, weight);
    let p = this.cache.get(file);
    if (!p) {
      p = (async () => {
        const bytes = await this.load(file);
        // Embed whole: pdf-lib's subsetter drops composite glyphs (e.g. most
        // capitals in Cormorant Garamond). The files are already Latin-subset.
        const pdf = await this.doc.embedFont(bytes, { subset: false });
        // fontkit's hhea metrics — what Chrome uses on macOS/Linux for line boxes.
        const fk = (
          pdf as unknown as {
            embedder: { font: { ascent: number; descent: number; unitsPerEm: number } };
          }
        ).embedder.font;
        return {
          pdf,
          metrics: {
            ascent: fk.ascent / fk.unitsPerEm,
            descent: Math.abs(fk.descent) / fk.unitsPerEm,
          },
        };
      })();
      this.cache.set(file, p);
    }
    return p;
  }
}

/** Width of `text` at `size` with CSS letter-spacing `spacing` (applied after every character). */
export function trackedWidth(font: PDFFont, text: string, size: number, spacing: number) {
  return font.widthOfTextAtSize(text, size) + [...text].length * spacing;
}

/**
 * Greedy word wrap, like a browser with `overflow-wrap: anywhere`: break at
 * spaces, and break inside a word only when the word alone is too wide.
 */
export function wrapText(
  font: PDFFont,
  text: string,
  size: number,
  spacing: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  const fits = (s: string) => trackedWidth(font, s, size, spacing) <= maxWidth + 1e-6;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate)) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (fits(word)) {
      line = word;
      continue;
    }
    // Word longer than the line: split it by characters.
    let chunk = "";
    for (const ch of [...word]) {
      if (chunk && !fits(chunk + ch)) {
        lines.push(chunk);
        chunk = ch;
      } else chunk += ch;
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Baseline offset from the top of a CSS line box of height `lineHeight`×`size`:
 * the browser centres the font's ascent+descent in the box (half-leading).
 */
export function baselineInLineBox(metrics: FontMetrics, size: number, lineHeight: number) {
  const content = (metrics.ascent + metrics.descent) * size;
  return (lineHeight * size - content) / 2 + metrics.ascent * size;
}
