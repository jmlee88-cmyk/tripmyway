import {
  PDFDocument,
  type PDFOperator,
  LineCapStyle,
  LineJoinStyle,
  PDFPage,
  beginText,
  clip,
  closePath,
  concatTransformationMatrix,
  endPath,
  endText,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setCharacterSpacing,
  setDashPattern,
  setFillingRgbColor,
  setFontAndSize,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  showText,
  stroke,
  type PDFName,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  featureFilter,
  latest,
  normalizePropertyExpression,
} from "@maplibre/maplibre-gl-style-spec";
import type { VectorTile, VectorTileFeature } from "@mapbox/vector-tile";
import type { Customization, MapStyleConfig } from "@/types/product";
import { getMapStyle } from "@/config/map-styles";
import { CANVAS_WRAP_IN, ZOOM_LEVELS, getFinish, getPrintSize } from "@/config/products";
import { DESIGN_WIDTH, buildMapStyle, effectiveZoom } from "@/components/map/build-map-style";
import {
  LAYOUT,
  PIN_PATH,
  applyCase,
  footerLine,
  hasRule,
  mapDrawRect,
  mapRect,
  posterLayout,
  showsFrame,
  posterHeight,
  trackingEm,
} from "@/components/poster/poster-layout";
import {
  FontCache,
  baselineInLineBox,
  trackedWidth,
  wrapText,
  type FontBytesLoader,
  type PrintFont,
} from "./fonts";
import { coverTiles, fetchTile, loadTileSource, project, tileZoomFor, type Fetcher } from "./tiles";

/**
 * PRINT RENDERER — turns a saved Customization into a vector PDF at the
 * physical print size. It reuses the preview's map style (buildMapStyle), map
 * framing (DESIGN_WIDTH canvas + effectiveZoom) and poster geometry
 * (poster-layout.ts), so the print is the preview the customer approved,
 * drawn at full resolution. Runs anywhere with fetch: browser, Worker, Node.
 */

export interface RenderOptions {
  /** Bleed on every side, in inches. Background colour extends into it. */
  bleedIn?: number;
  fetcher?: Fetcher;
  loadFont: FontBytesLoader;
  /** Free-form identifiers written into the PDF metadata. */
  orderRef?: string;
  onProgress?: (step: string) => void;
  /**
   * Canvas only: surround the design with a mirrored gallery wrap of
   * CANVAS_WRAP_IN on every side (replaces the bleed). Defaults to on for
   * canvas designs; screen previews turn it off.
   */
  canvasWrap?: boolean;
}

export interface RenderResult {
  bytes: Uint8Array;
  fileName: string;
  widthIn: number;
  heightIn: number;
  bleedIn: number;
  /** Mirrored wrap on each side, in inches (canvas only; 0 otherwise). */
  wrapIn: number;
  tileCount: number;
}

export const PRINT_RENDERER_VERSION = "1";

export type Ops = PDFOperator[];

/**
 * Appends without spreading. Dense cities produce hundreds of thousands of
 * path operators per tile, which overflows `push(...array)` argument limits.
 */
export function append(target: Ops, source: Ops) {
  for (let i = 0; i < source.length; i++) target.push(source[i]!);
}

/** Writes operators to the page in bounded batches, for the same reason. */
export function flush(page: PDFPage, ops: Ops) {
  const BATCH = 10_000;
  for (let i = 0; i < ops.length; i += BATCH) page.pushOperators(...ops.slice(i, i + BATCH));
  ops.length = 0;
}

export function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function colorOps(hex: string, kind: "fill" | "stroke"): PDFOperator {
  const { r, g, b } = hexToRgb(hex);
  return kind === "fill" ? setFillingRgbColor(r, g, b) : setStrokingRgbColor(r, g, b);
}

/** Registers (once per page) an ExtGState with the given opacity; returns its resource name. */
export function alphaState(page: PDFPage, cache: Map<number, PDFName>, alpha: number): PDFName {
  const key = Math.round(alpha * 1000) / 1000;
  let name = cache.get(key);
  if (!name) {
    const dict = page.doc.context.obj({ Type: "ExtGState", ca: key, CA: key });
    name = page.node.newExtGState("GS", dict);
    cache.set(key, name);
  }
  return name;
}

// ─── Map layers ──────────────────────────────────────────────────────────────

type StyleLayer = ReturnType<typeof buildMapStyle>["layers"][number];

interface CompiledLayer {
  id: string;
  type: "background" | "fill" | "line";
  sourceLayer: string | undefined;
  minzoom: number;
  filter: ReturnType<typeof featureFilter> | null;
  paint: Record<string, unknown>;
  layout: Record<string, unknown>;
}

function evaluateProps(
  group: Record<string, unknown> | undefined,
  specGroup: Record<string, unknown>,
  layerIndex: number,
  part: string,
  zoom: number,
) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(group ?? {})) {
    const spec = specGroup[k];
    if (!spec) continue;
    const expr = normalizePropertyExpression(
      v as never,
      `layers[${layerIndex}].${part}.${k}`,
      spec as never,
    );
    out[k] = expr.evaluate({ zoom } as never);
  }
  return out;
}

export function compileLayers(layers: StyleLayer[], zoom: number): CompiledLayer[] {
  const spec = latest as unknown as Record<string, Record<string, unknown>>;
  return layers.map((l, i) => {
    const layer = l as StyleLayer & {
      "source-layer"?: string;
      minzoom?: number;
      filter?: unknown;
      paint?: Record<string, unknown>;
      layout?: Record<string, unknown>;
    };
    const type = layer.type as CompiledLayer["type"];
    return {
      id: layer.id,
      type,
      sourceLayer: layer["source-layer"],
      minzoom: layer.minzoom ?? 0,
      filter: layer.filter ? featureFilter(layer.filter as never, `layers[${i}].filter`) : null,
      paint: evaluateProps(layer.paint, spec[`paint_${type}`]!, i, "paint", zoom),
      layout: evaluateProps(layer.layout, spec[`layout_${type}`] ?? {}, i, "layout", zoom),
    };
  });
}

function colorToHex(c: unknown): { hex: string; alpha: number } {
  const col = c as { r: number; g: number; b: number; a: number };
  const to = (v: number) =>
    Math.round((col.a > 0 ? v / col.a : v) * 255)
      .toString(16)
      .padStart(2, "0");
  return { hex: `#${to(col.r)}${to(col.g)}${to(col.b)}`, alpha: col.a };
}

/** Appends a feature's geometry (tile coords → canvas px) as path operators. */
function pathOps(
  feature: VectorTileFeature,
  ox: number,
  oy: number,
  scale: number,
  closeRings: boolean,
  ops: Ops,
) {
  for (const ring of feature.loadGeometry()) {
    if (ring.length < 2) continue;
    ring.forEach((p, i) => {
      const x = ox + p.x * scale;
      const y = oy + p.y * scale;
      ops.push(i === 0 ? moveTo(x, y) : lineTo(x, y));
    });
    if (closeRings) ops.push(closePath());
  }
}

export interface PlacedTile {
  tile: VectorTile | null;
  ox: number;
  oy: number;
  size: number;
}

export function drawMapLayers(
  page: PDFPage,
  alphaCache: Map<number, PDFName>,
  layers: CompiledLayer[],
  tiles: PlacedTile[],
  canvas: { w: number; h: number },
  zoom: number,
): Ops {
  const ops: Ops = [];
  for (const layer of layers) {
    if (zoom < layer.minzoom) continue;
    const p = layer.paint;
    if (layer.type === "background") {
      const { hex, alpha } = colorToHex(p["background-color"]);
      ops.push(
        pushGraphicsState(),
        setGraphicsState(alphaState(page, alphaCache, alpha)),
        colorOps(hex, "fill"),
        rectangle(0, 0, canvas.w, canvas.h),
        fill(),
        popGraphicsState(),
      );
      continue;
    }
    const isFill = layer.type === "fill";
    const { hex, alpha: colorAlpha } = colorToHex(p[isFill ? "fill-color" : "line-color"]);
    const opacity =
      ((p[isFill ? "fill-opacity" : "line-opacity"] as number | undefined) ?? 1) * colorAlpha;
    const width = (p["line-width"] as number | undefined) ?? 1;
    if (opacity <= 0 || (!isFill && width <= 0)) continue;

    for (const t of tiles) {
      const vtLayer = t.tile && layer.sourceLayer ? t.tile.layers[layer.sourceLayer] : undefined;
      if (!vtLayer) continue;
      const geomOps: Ops = [];
      const scale = t.size / vtLayer.extent;
      for (let i = 0; i < vtLayer.length; i++) {
        const f = vtLayer.feature(i);
        if (isFill && f.type !== 3) continue;
        if (!isFill && f.type === 1) continue;
        if (layer.filter && !layer.filter.filter({ zoom } as never, f as never)) continue;
        pathOps(f, t.ox, t.oy, scale, isFill, geomOps);
      }
      if (geomOps.length === 0) continue;
      // Clip to the tile so features duplicated in neighbouring tiles' buffers don't double-draw.
      ops.push(pushGraphicsState(), rectangle(t.ox, t.oy, t.size, t.size), clip(), endPath());
      ops.push(setGraphicsState(alphaState(page, alphaCache, opacity)));
      if (isFill) {
        ops.push(colorOps(hex, "fill"));
        append(ops, geomOps);
        ops.push(fill());
      } else {
        const cap =
          layer.layout["line-cap"] === "round"
            ? LineCapStyle.Round
            : layer.layout["line-cap"] === "square"
              ? LineCapStyle.Projecting
              : LineCapStyle.Butt;
        const join =
          layer.layout["line-join"] === "round"
            ? LineJoinStyle.Round
            : layer.layout["line-join"] === "bevel"
              ? LineJoinStyle.Bevel
              : LineJoinStyle.Miter;
        const dash = p["line-dasharray"] as number[] | undefined;
        ops.push(colorOps(hex, "stroke"), setLineWidth(width), setLineCap(cap), setLineJoin(join));
        if (dash && dash.length)
          ops.push(
            setDashPattern(
              dash.map((d) => d * width),
              0,
            ),
          );
        append(ops, geomOps);
        ops.push(stroke());
      }
      ops.push(popGraphicsState());
    }
  }
  return ops;
}

// ─── Text ────────────────────────────────────────────────────────────────────

interface TextLine {
  text: string;
  font: PrintFont;
  size: number; // cqw
  spacing: number; // cqw
  padLeft: number; // cqw
  color: string;
  opacity: number;
  baseline: number; // cqw from poster top
}

/** CSS-equivalent horizontal start of a centred line in a box [left, left+width] (cqw). */
function lineStartX(line: TextLine, left: number, width: number) {
  const w = trackedWidth(line.font.pdf, line.text, line.size, line.spacing);
  const avail = width - line.padLeft;
  return left + line.padLeft + Math.max(0, (avail - w) / 2);
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function renderPrintPdf(c: Customization, opts: RenderOptions): Promise<RenderResult> {
  if (!c.location) throw new Error("This design has no location.");
  const fetcher = opts.fetcher ?? ((url: string) => fetch(url));
  const progress = opts.onProgress ?? (() => {});
  const style = getMapStyle(c.styleId);
  const cfg: MapStyleConfig = style.configuration;
  const size = getPrintSize(c.printSize);
  const finish = getFinish(c.finish);
  const wrapIn = finish.id === "canvas" && opts.canvasWrap !== false ? CANVAS_WRAP_IN : 0;
  // A canvas wrap mirrors the design's own edges, so the design itself has no bleed.
  const bleedIn = wrapIn ? 0 : (opts.bleedIn ?? 0.125);

  // Physical page: 1cqw = 1% of trim width.
  const trimW = size.widthIn * 72;
  const trimH = size.heightIn * 72;
  const bleed = bleedIn * 72;
  const u = trimW / 100;
  const Hc = posterHeight(size.widthIn, size.heightIn);
  const X = (x: number) => bleed + x * u;
  const Y = (y: number) => bleed + trimH - y * u;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([trimW + 2 * bleed, trimH + 2 * bleed]);
  page.setMediaBox(0, 0, trimW + 2 * bleed, trimH + 2 * bleed);
  page.setBleedBox(0, 0, trimW + 2 * bleed, trimH + 2 * bleed);
  page.setTrimBox(bleed, bleed, trimW, trimH);
  const alphaCache = new Map<number, PDFName>();
  const ops: Ops = [];

  // Paper colour, out to the bleed edge.
  ops.push(
    colorOps(cfg.background, "fill"),
    rectangle(0, 0, trimW + 2 * bleed, trimH + 2 * bleed),
    fill(),
  );

  // ── Map ──
  progress("Loading map data");
  const mapStyle = buildMapStyle(cfg);
  const source = mapStyle.sources["omt"] as { url: string };
  const tileSource = await loadTileSource(source.url, fetcher);
  const framing = ZOOM_LEVELS.find((z) => z.id === c.zoomLevel)?.zoom ?? 12;
  const zoom = effectiveZoom(framing);
  const layout = posterLayout(c);
  const rect = mapRect(Hc, layout);
  // Edge-to-edge maps continue into the bleed so a slightly off cut still
  // ends on map, not paper. Framed maps sit inside the margin: draw === rect.
  const draw = mapDrawRect(rect, Hc, (bleedIn / size.widthIn) * 100);
  const p = DESIGN_WIDTH / rect.width; // design px per cqw (framing is set by the map window)
  const canvas = { w: draw.width * p, h: draw.height * p };
  const located = project(c.location.longitude, c.location.latitude, zoom);
  // The location stays centred in the map window; shift to the draw area's centre.
  const center = {
    x: located.x + (draw.x + draw.width / 2 - (rect.x + rect.width / 2)) * p,
    y: located.y + (draw.y + draw.height / 2 - (rect.y + rect.height / 2)) * p,
  };
  const cover = coverTiles(center, canvas.w, canvas.h, zoom, tileZoomFor(zoom, tileSource));
  const tiles: PlacedTile[] = await Promise.all(
    cover.map(async (t) => ({
      tile: await fetchTile(tileSource, t.ref, fetcher),
      ox: t.ox,
      oy: t.oy,
      size: t.size,
    })),
  );

  progress("Drawing map");
  const k = u / p; // pt per design px
  ops.push(pushGraphicsState());
  // Design px (y down) → page pt (y up), origin at the draw area's top-left.
  ops.push(concatTransformationMatrix(k, 0, 0, -k, X(draw.x), Y(draw.y)));
  ops.push(rectangle(0, 0, canvas.w, canvas.h), clip(), endPath());
  append(
    ops,
    drawMapLayers(page, alphaCache, compileLayers(mapStyle.layers, zoom), tiles, canvas, zoom),
  );
  ops.push(popGraphicsState());

  // Grid overlay (Architectural) and marker live inside the map window.
  ops.push(
    pushGraphicsState(),
    rectangle(X(rect.x), Y(rect.y + rect.height), rect.width * u, rect.height * u),
    clip(),
    endPath(),
  );
  if (cfg.border === "grid") append(ops, gridOps(page, alphaCache, cfg, rect, X, Y, u));
  ops.push(popGraphicsState());
  flush(page, ops);
  if (c.markerStyle !== "none") drawMarker(page, c.markerStyle, cfg, rect, X, Y, u);

  // ── Frame ──
  if (showsFrame(cfg, layout)) append(ops, borderOps(page, alphaCache, cfg, Hc, X, Y, u));

  // ── Text ──
  progress("Setting type");
  const fonts = new FontCache(doc, opts.loadFont);
  const titleFont = await fonts.get(cfg.titleFont, cfg.titleWeight);
  const bodyFont = await fonts.get(cfg.bodyFont, 400);
  const L = LAYOUT;
  const boxLeft = L.textInset;
  const boxWidth = 100 - 2 * L.textInset;

  const titleSpacing = trackingEm(cfg.titleTracking) * L.title.size;
  const subSpacing = L.subtitle.tracking * L.subtitle.size;
  const footSpacing = L.footer.tracking * L.footer.size;
  const titleText = applyCase(c, c.title).trim() || " ";
  const titleLines = wrapText(
    titleFont.pdf,
    titleText,
    L.title.size,
    titleSpacing,
    boxWidth - titleSpacing,
  );
  const subLines = wrapText(
    bodyFont.pdf,
    applyCase(c, c.subtitle),
    L.subtitle.size,
    subSpacing,
    boxWidth - subSpacing,
  );
  const footer = footerLine(c);
  const footLines = footer
    ? wrapText(bodyFont.pdf, footer, L.footer.size, footSpacing, boxWidth)
    : [];

  const titleLH = L.title.size * L.title.lineHeight;
  const subLH = L.subtitle.size * L.subtitle.lineHeight;
  const footLH = L.footer.size * L.footer.lineHeight;
  const gap = hasRule(cfg) ? L.rule.marginTop + L.rule.thickness + L.rule.marginBottom : L.plainGap;
  const blockH =
    titleLines.length * titleLH +
    gap +
    subLines.length * subLH +
    (footLines.length ? L.footer.marginTop + footLines.length * footLH : 0);
  let y = Hc - L.textBandHeight + (L.textBandHeight - blockH) / 2;

  const lines: TextLine[] = [];
  for (const t of titleLines) {
    lines.push({
      text: t,
      font: titleFont,
      size: L.title.size,
      spacing: titleSpacing,
      padLeft: titleSpacing,
      color: cfg.label,
      opacity: 1,
      baseline: y + baselineInLineBox(titleFont.metrics, L.title.size, L.title.lineHeight),
    });
    y += titleLH;
  }
  if (hasRule(cfg)) {
    const ry = y + L.rule.marginTop;
    ops.push(
      pushGraphicsState(),
      setGraphicsState(alphaState(page, alphaCache, L.rule.opacity)),
      colorOps(cfg.accent, "fill"),
    );
    ops.push(
      rectangle(
        X(50 - L.rule.width / 2),
        Y(ry + L.rule.thickness),
        L.rule.width * u,
        L.rule.thickness * u,
      ),
      fill(),
      popGraphicsState(),
    );
  }
  y += gap;
  for (const t of subLines) {
    lines.push({
      text: t,
      font: bodyFont,
      size: L.subtitle.size,
      spacing: subSpacing,
      padLeft: subSpacing,
      color: cfg.subLabel,
      opacity: 1,
      baseline: y + baselineInLineBox(bodyFont.metrics, L.subtitle.size, L.subtitle.lineHeight),
    });
    y += subLH;
  }
  if (footLines.length) {
    y += L.footer.marginTop;
    for (const t of footLines) {
      lines.push({
        text: t,
        font: bodyFont,
        size: L.footer.size,
        spacing: footSpacing,
        padLeft: 0,
        color: cfg.subLabel,
        opacity: L.footer.opacity,
        baseline: y + baselineInLineBox(bodyFont.metrics, L.footer.size, L.footer.lineHeight),
      });
      y += footLH;
    }
  }

  // Map credit, required by the OpenStreetMap and OpenMapTiles licences.
  const A = L.attribution;
  const aSpacing = A.tracking * A.size;
  const aBoxBottom = Hc - (A.baselineFromBottom - A.size * 0.2);
  lines.push({
    text: A.text,
    font: bodyFont,
    size: A.size,
    spacing: aSpacing,
    padLeft: aSpacing,
    color: cfg.subLabel,
    opacity: A.opacity,
    baseline: aBoxBottom - A.size + baselineInLineBox(bodyFont.metrics, A.size, 1),
  });

  for (const line of lines) {
    const isAttribution = line.text === A.text;
    const x = isAttribution ? lineStartX(line, 0, 100) : lineStartX(line, boxLeft, boxWidth);
    const fontKey = page.node.newFontDictionary(line.font.pdf.name, line.font.pdf.ref);
    const { r, g, b } = hexToRgb(line.color);
    ops.push(
      pushGraphicsState(),
      setGraphicsState(alphaState(page, alphaCache, line.opacity)),
      beginText(),
      setFillingRgbColor(r, g, b),
      setFontAndSize(fontKey, line.size * u),
      setCharacterSpacing(line.spacing * u),
      setTextMatrix(1, 0, 0, 1, X(x), Y(line.baseline)),
      showText(line.font.pdf.encodeText(line.text)),
      endText(),
      popGraphicsState(),
    );
  }
  flush(page, ops);

  if (wrapIn) progress("Adding canvas wrap");
  // Fonts are only finalised on save, so wrap a saved copy of the design.
  const out = wrapIn ? await wrapCanvas(await doc.save(), trimW, trimH, wrapIn * 72) : doc;

  out.setTitle(`${c.title} — ${c.subtitle}`);
  out.setSubject(
    `${style.name} · ${size.label} in · ${finish.label}${wrapIn ? ` (${wrapIn} in mirrored wrap)` : ""} · ${c.location.formattedAddress}`,
  );
  out.setCreator(`TripMyWay print renderer v${PRINT_RENDERER_VERSION}`);
  out.setProducer("TripMyWay");
  out.setKeywords([
    `style:${style.id}`,
    `size:${size.id}`,
    `finish:${finish.id}`,
    ...(wrapIn ? [`wrap:${wrapIn}in-mirrored`] : []),
    `zoom:${c.zoomLevel}`,
    `layout:${posterLayout(c)}`,
    `lat:${c.location.latitude}`,
    `lng:${c.location.longitude}`,
    ...(opts.orderRef ? [`order:${opts.orderRef}`] : []),
  ]);

  progress("Saving PDF");
  const bytes = await out.save();
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
  const fileName = `${opts.orderRef ? `${slug(opts.orderRef)}_` : ""}${slug(c.title) || "map"}_${style.id}${posterLayout(c) === "fullBleed" ? "-edge" : ""}_${size.id}${finish.id === "paper" ? "" : `_${finish.id}`}.pdf`;
  return {
    bytes,
    fileName,
    widthIn: size.widthIn,
    heightIn: size.heightIn,
    bleedIn,
    wrapIn,
    tileCount: tiles.filter((t) => t.tile).length,
  };
}

/**
 * Gallery-wrapped canvas: the design (trimW × trimH pt) in the middle of a
 * page `wrap` pt larger on every side, filled with mirror images of the
 * design so its edges continue round the frame. The TrimBox marks the front
 * face; the whole page is printed.
 */
async function wrapCanvas(
  designBytes: Uint8Array,
  trimW: number,
  trimH: number,
  wrap: number,
): Promise<PDFDocument> {
  const out = await PDFDocument.create();
  const [art] = await out.embedPdf(designBytes, [0]);
  if (!art) throw new Error("Canvas wrap: the design page is missing.");
  const W = trimW + 2 * wrap;
  const H = trimH + 2 * wrap;
  const page = out.addPage([W, H]);
  page.setMediaBox(0, 0, W, H);
  page.setBleedBox(0, 0, W, H);
  page.setTrimBox(wrap, wrap, trimW, trimH);
  // Mirror about the design's edges: left/right copies flip x, top/bottom flip y.
  for (const mx of [-1, 0, 1])
    for (const my of [-1, 0, 1]) {
      if (mx === 0 && my === 0) continue;
      page.drawPage(art, {
        x: mx === 0 ? wrap : mx < 0 ? wrap : wrap + 2 * trimW,
        y: my === 0 ? wrap : my < 0 ? wrap : wrap + 2 * trimH,
        xScale: mx === 0 ? 1 : -1,
        yScale: my === 0 ? 1 : -1,
      });
    }
  page.drawPage(art, { x: wrap, y: wrap });
  return out;
}

// ─── Frame, grid, marker ─────────────────────────────────────────────────────

type Coord = (n: number) => number;

function strokeRectOps(
  page: PDFPage,
  alphaCache: Map<number, PDFName>,
  color: string,
  inset: number,
  width: number,
  opacity: number,
  Hc: number,
  X: Coord,
  Y: Coord,
  u: number,
): Ops {
  // CSS draws the border inside the inset box: centre the stroke half a width in.
  const i = inset + width / 2;
  return [
    pushGraphicsState(),
    setGraphicsState(alphaState(page, alphaCache, opacity)),
    colorOps(color, "stroke"),
    setLineWidth(width * u),
    setLineJoin(LineJoinStyle.Miter),
    rectangle(X(i), Y(Hc - i), (100 - 2 * i) * u, (Hc - 2 * i) * u),
    stroke(),
    popGraphicsState(),
  ];
}

function borderOps(
  page: PDFPage,
  alphaCache: Map<number, PDFName>,
  cfg: MapStyleConfig,
  Hc: number,
  X: Coord,
  Y: Coord,
  u: number,
): Ops {
  const b = LAYOUT.border;
  if (cfg.border === "none") return [];
  if (cfg.border === "double") {
    return [
      ...strokeRectOps(
        page,
        alphaCache,
        cfg.label,
        b.double.outer.inset,
        b.double.outer.width,
        b.double.outer.opacity,
        Hc,
        X,
        Y,
        u,
      ),
      ...strokeRectOps(
        page,
        alphaCache,
        cfg.label,
        b.double.inner.inset,
        b.double.inner.width,
        b.double.inner.opacity,
        Hc,
        X,
        Y,
        u,
      ),
    ];
  }
  return strokeRectOps(
    page,
    alphaCache,
    cfg.label,
    b.hairline.inset,
    b.hairline.width,
    b.hairline.opacity,
    Hc,
    X,
    Y,
    u,
  );
}

function gridOps(
  page: PDFPage,
  alphaCache: Map<number, PDFName>,
  cfg: MapStyleConfig,
  rect: ReturnType<typeof mapRect>,
  X: Coord,
  Y: Coord,
  u: number,
): Ops {
  const g = LAYOUT.grid;
  // CSS: background tiles of `spacing`, centred in the box; each tile paints a
  // line along its top and its left edge. Plus an inset frame of the same width.
  const offX = (((rect.width - g.spacing) / 2) % g.spacing) - g.spacing;
  const offY = (((rect.height - g.spacing) / 2) % g.spacing) - g.spacing;
  const ops: Ops = [
    pushGraphicsState(),
    setGraphicsState(alphaState(page, alphaCache, g.opacity)),
    colorOps(cfg.label, "fill"),
  ];
  const r = (x: number, y: number, w: number, h: number) =>
    ops.push(rectangle(X(rect.x + x), Y(rect.y + y + h), w * u, h * u));
  for (let x = offX; x < rect.width; x += g.spacing) r(x, 0, g.width, rect.height);
  for (let y = offY; y < rect.height; y += g.spacing) r(0, y, rect.width, g.width);
  r(0, 0, rect.width, g.width);
  r(0, rect.height - g.width, rect.width, g.width);
  r(0, 0, g.width, rect.height);
  r(rect.width - g.width, 0, g.width, rect.height);
  ops.push(fill(), popGraphicsState());
  return ops;
}

const circlePath = (cx: number, cy: number, r: number) =>
  `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;

function drawMarker(
  page: PDFPage,
  kind: Customization["markerStyle"],
  cfg: MapStyleConfig,
  rect: ReturnType<typeof mapRect>,
  X: Coord,
  Y: Coord,
  u: number,
) {
  const m = LAYOUT.marker;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const accent = hexToRgb(cfg.accent);
  const bg = hexToRgb(cfg.background);
  if (kind === "dot") {
    const s = (m.dot.width * u) / m.dot.viewBox; // pt per svg unit
    const ox = X(cx - m.dot.width / 2);
    const oy = Y(cy - m.dot.width / 2);
    page.drawSvgPath(circlePath(20, 20, 17), {
      x: ox,
      y: oy,
      scale: s,
      borderColor: rgb(accent.r, accent.g, accent.b),
      borderWidth: 1.5,
      borderOpacity: 0.6,
    });
    page.drawSvgPath(circlePath(20, 20, 6), {
      x: ox,
      y: oy,
      scale: s,
      color: rgb(accent.r, accent.g, accent.b),
      borderColor: rgb(bg.r, bg.g, bg.b),
      borderWidth: 2,
    });
    return;
  }
  const s = (m.pin.width * u) / m.pin.viewBoxWidth;
  const hCq = (m.pin.width * m.pin.viewBoxHeight) / m.pin.viewBoxWidth;
  const ox = X(cx - m.pin.width / 2);
  const oy = Y(cy - hCq);
  page.drawSvgPath(PIN_PATH, {
    x: ox,
    y: oy,
    scale: s,
    color: rgb(accent.r, accent.g, accent.b),
    borderColor: rgb(bg.r, bg.g, bg.b),
    borderWidth: 1.5,
  });
  page.drawSvgPath(circlePath(15, 15, 4.5), {
    x: ox,
    y: oy,
    scale: s,
    color: rgb(bg.r, bg.g, bg.b),
  });
}
