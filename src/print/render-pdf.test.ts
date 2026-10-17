import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import geojsonvt from "geojson-vt";
import { fromGeojsonVt } from "vt-pbf";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import type { FeatureCollection } from "geojson";
import type { Customization } from "@/types/product";
import { CANVAS_WRAP_IN, DEFAULT_CUSTOMIZATION, getPrintSize } from "@/config/products";
import { renderPrintPdf } from "./render-pdf";
import { coverTiles, project } from "./tiles";
import { mapDrawRect, mapRect } from "@/components/poster/poster-layout";

/**
 * End-to-end render against synthetic vector tiles (the real tile server is
 * not reachable from CI). Set PRINT_SAMPLES_DIR to also write the PDFs out for
 * visual inspection.
 */

const CENTER = { lng: -118.1445, lat: 34.1478 };

function syntheticWorld(): Record<string, FeatureCollection> {
  const line = (cls: string, coords: [number, number][]) => ({
    type: "Feature" as const,
    properties: { class: cls },
    geometry: { type: "LineString" as const, coordinates: coords },
  });
  const roads = [];
  for (let i = -40; i <= 40; i++) {
    const d = i * 0.0015;
    const cls = i % 10 === 0 ? "primary" : i % 4 === 0 ? "secondary" : "minor";
    roads.push(
      line(cls, [
        [CENTER.lng - 0.08, CENTER.lat + d],
        [CENTER.lng + 0.08, CENTER.lat + d + 0.004],
      ]),
    );
    roads.push(
      line(cls, [
        [CENTER.lng + d, CENTER.lat - 0.08],
        [CENTER.lng + d - 0.003, CENTER.lat + 0.08],
      ]),
    );
  }
  roads.push(
    line("motorway", [
      [CENTER.lng - 0.08, CENTER.lat - 0.05],
      [CENTER.lng + 0.08, CENTER.lat + 0.03],
    ]),
  );
  const poly = (cls: string, cx: number, cy: number, r: number) => ({
    type: "Feature" as const,
    properties: { class: cls },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [cx - r, cy - r],
          [cx + r, cy - r],
          [cx + r, cy + r * 0.6],
          [cx - r * 0.4, cy + r],
          [cx - r, cy - r],
        ] as [number, number][],
      ],
    },
  });
  return {
    transportation: { type: "FeatureCollection", features: roads },
    water: {
      type: "FeatureCollection",
      features: [poly("lake", CENTER.lng - 0.012, CENTER.lat + 0.01, 0.006)],
    },
    park: {
      type: "FeatureCollection",
      features: [poly("park", CENTER.lng + 0.015, CENTER.lat - 0.012, 0.005)],
    },
  };
}

function syntheticFetcher() {
  const world = syntheticWorld();
  const indexes = Object.fromEntries(
    Object.entries(world).map(([k, fc]) => [
      k,
      new geojsonvt(fc, { maxZoom: 14, indexMaxZoom: 14, extent: 4096, buffer: 64 }),
    ]),
  );
  return async (url: string) => {
    if (url.endsWith("/planet"))
      return new Response(
        JSON.stringify({ tiles: ["https://tiles.test/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14 }),
      );
    const m = /(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(url);
    if (!m) return new Response("", { status: 404 });
    const [z, x, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const layers: Record<string, unknown> = {};
    for (const [k, idx] of Object.entries(indexes)) {
      const t = idx.getTile(z, x, y);
      if (t) layers[k] = t;
    }
    if (Object.keys(layers).length === 0) return new Response(null, { status: 204 });
    return new Response(fromGeojsonVt(layers, { version: 2 }) as BodyInit);
  };
}

const loadFont = async (file: string) =>
  new Uint8Array(readFileSync(join(process.cwd(), "public/fonts/print", file)));

function design(overrides: Partial<Customization>): Customization {
  return { ...DEFAULT_CUSTOMIZATION, ...overrides };
}

describe("coverTiles", () => {
  it("covers the canvas exactly", () => {
    const zoom = 13.8;
    const c = project(CENTER.lng, CENTER.lat, zoom);
    const tiles = coverTiles(c, 1600, 2000, zoom, 13);
    const minX = Math.min(...tiles.map((t) => t.ox));
    const minY = Math.min(...tiles.map((t) => t.oy));
    const maxX = Math.max(...tiles.map((t) => t.ox + t.size));
    const maxY = Math.max(...tiles.map((t) => t.oy + t.size));
    expect(minX).toBeLessThanOrEqual(0);
    expect(minY).toBeLessThanOrEqual(0);
    expect(maxX).toBeGreaterThanOrEqual(1600);
    expect(maxY).toBeGreaterThanOrEqual(2000);
    expect(tiles[0]!.size).toBeCloseTo(512 * 2 ** 0.8, 5);
  });
});

describe("poster layouts", () => {
  it("framed maps sit inside the margin and never draw into the bleed", () => {
    const rect = mapRect(133.33, "framed");
    expect(rect.x).toBe(6);
    expect(mapDrawRect(rect, 133.33, 0.7)).toEqual(rect);
  });
  it("edge-to-edge maps touch the top and sides and extend into the bleed there", () => {
    const H = 133.33;
    const rect = mapRect(H, "fullBleed");
    expect(rect).toMatchObject({ x: 0, y: 0, width: 100 });
    expect(rect.height).toBeCloseTo(H - 30, 6);
    const draw = mapDrawRect(rect, H, 0.7);
    expect(draw.x).toBeCloseTo(-0.7, 9);
    expect(draw.y).toBeCloseTo(-0.7, 9);
    expect(draw.width).toBeCloseTo(101.4, 9);
    // The bottom edge meets the text band, not the trim edge: no extension.
    expect(draw.y + draw.height).toBeCloseTo(rect.height, 9);
  });
});

describe("renderPrintPdf with dense cities", () => {
  it("handles hundreds of thousands of path segments in one tile", async () => {
    // Paris/New York tiles produce enough path operators to overflow
    // `fn(...array)` argument limits; this reproduces that density.
    const roads = [];
    for (let i = 0; i < 2500; i++) {
      const pts: [number, number][] = [];
      for (let j = 0; j < 160; j++)
        pts.push([
          CENTER.lng - 0.004 + j * 0.00005,
          CENTER.lat - 0.004 + i * 0.0000032 + (j % 2) * 0.000002,
        ]);
      roads.push({
        type: "Feature" as const,
        properties: { class: "minor" },
        geometry: { type: "LineString" as const, coordinates: pts },
      });
    }
    const idx = new geojsonvt(
      { type: "FeatureCollection", features: roads },
      { maxZoom: 14, indexMaxZoom: 14, extent: 4096, buffer: 64, tolerance: 0 },
    );
    const fetcher = async (url: string) => {
      if (url.endsWith("/planet"))
        return new Response(
          JSON.stringify({
            tiles: ["https://tiles.test/{z}/{x}/{y}.pbf"],
            minzoom: 0,
            maxzoom: 14,
          }),
        );
      const m = /(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(url)!;
      const t = idx.getTile(Number(m[1]), Number(m[2]), Number(m[3]));
      return t
        ? new Response(fromGeojsonVt({ transportation: t }, { version: 2 }) as BodyInit)
        : new Response(null, { status: 204 });
    };
    const res = await renderPrintPdf(design({ styleId: "midnight", printSize: "24x36" }), {
      fetcher,
      loadFont,
    });
    expect(res.bytes.byteLength).toBeGreaterThan(100_000);
  }, 60_000);
});

describe("renderPrintPdf", () => {
  const cases: [string, Partial<Customization>][] = [
    ["modern-minimal 18x24", { styleId: "modern-minimal", printSize: "18x24" }],
    ["vintage 8x10 pin", { styleId: "vintage", printSize: "8x10", markerStyle: "pin" }],
    ["midnight 24x36 dot", { styleId: "midnight", printSize: "24x36", markerStyle: "dot" }],
    [
      "topographic 12x18 neighborhood",
      { styleId: "topographic", printSize: "12x18", zoomLevel: "neighborhood" },
    ],
    [
      "midnight 18x24 edge to edge",
      { styleId: "midnight", printSize: "18x24", layout: "fullBleed", markerStyle: "pin" },
    ],
    ["vintage 12x18 edge to edge", { styleId: "vintage", printSize: "12x18", layout: "fullBleed" }],
    [
      "modern-minimal 32x48 metal",
      { styleId: "modern-minimal", printSize: "32x48", finish: "metal" },
    ],
    [
      "architectural 8x10 edge to edge",
      { styleId: "architectural", printSize: "8x10", layout: "fullBleed" },
    ],
    [
      "architectural 18x24 long title",
      {
        styleId: "architectural",
        printSize: "18x24",
        title: "THE LITTLE HOUSE ON MOUNTAIN STREET",
        subtitle: "PASADENA, CALIFORNIA, UNITED STATES OF AMERICA",
      },
    ],
  ];

  for (const [name, overrides] of cases) {
    it(`renders ${name}`, async () => {
      const c = design(overrides);
      const res = await renderPrintPdf(c, {
        fetcher: syntheticFetcher(),
        loadFont,
        orderRef: "TEST-1001",
      });
      const size = getPrintSize(c.printSize);
      expect(res.tileCount).toBeGreaterThan(0);

      const doc = await PDFDocument.load(res.bytes);
      expect(doc.getPageCount()).toBe(1);
      const page = doc.getPage(0);
      const bleed = 0.125 * 72;
      expect(page.getWidth()).toBeCloseTo(size.widthIn * 72 + 2 * bleed, 3);
      expect(page.getHeight()).toBeCloseTo(size.heightIn * 72 + 2 * bleed, 3);
      const trim = page.getTrimBox();
      expect(trim.x).toBeCloseTo(bleed, 3);
      expect(trim.width).toBeCloseTo(size.widthIn * 72, 3);
      // Fonts are embedded (FontFile2), not referenced by name.
      const fonts = page.node.Resources()?.lookup(PDFName.of("Font"), PDFDict);
      expect(fonts?.keys().length ?? 0).toBeGreaterThan(0);
      expect(doc.getKeywords()).toContain("order:TEST-1001");

      const out = process.env["PRINT_SAMPLES_DIR"];
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, res.fileName), res.bytes);
      }
    }, 30_000);
  }
});

describe("canvas gallery wrap", () => {
  for (const layout of ["framed", "fullBleed"] as const) {
    it(`mirrors the design round a ${layout} canvas`, async () => {
      const c = design({ styleId: "vintage", printSize: "12x18", finish: "canvas", layout });
      const res = await renderPrintPdf(c, { fetcher: syntheticFetcher(), loadFont });
      const wrap = CANVAS_WRAP_IN * 72;
      expect(res.wrapIn).toBe(CANVAS_WRAP_IN);
      expect(res.fileName).toMatch(/_canvas\.pdf$/);
      const doc = await PDFDocument.load(res.bytes);
      const page = doc.getPage(0);
      expect(page.getWidth()).toBeCloseTo(12 * 72 + 2 * wrap, 3);
      expect(page.getHeight()).toBeCloseTo(18 * 72 + 2 * wrap, 3);
      const trim = page.getTrimBox();
      expect(trim.x).toBeCloseTo(wrap, 3);
      expect(trim.width).toBeCloseTo(12 * 72, 3);
      expect(doc.getKeywords()).toContain("finish:canvas");
      const out = process.env["PRINT_SAMPLES_DIR"];
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, `${layout}-${res.fileName}`), res.bytes);
      }
    }, 30_000);
  }

  it("leaves the wrap off when asked (screen previews)", async () => {
    const c = design({ printSize: "8x10", finish: "canvas" });
    const res = await renderPrintPdf(c, {
      fetcher: syntheticFetcher(),
      loadFont,
      bleedIn: 0,
      canvasWrap: false,
    });
    expect(res.wrapIn).toBe(0);
    const page = (await PDFDocument.load(res.bytes)).getPage(0);
    expect(page.getWidth()).toBeCloseTo(8 * 72, 3);
  }, 30_000);
});
