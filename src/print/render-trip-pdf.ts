import {
  PDFDocument,
  type PDFImage,
  type PDFName,
  type PDFPage,
  LineCapStyle,
  LineJoinStyle,
  appendBezierCurve,
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
  setCharacterSpacing,
  setDashPattern,
  setFillingRgbColor,
  setFontAndSize,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setTextMatrix,
  showText,
  stroke,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { MapStyleConfig } from "@/types/product";
import type { TripDesign, TripPhoto, TripStop } from "@/types/trip";
import { getMapStyle } from "@/config/map-styles";
import { getFinish, getPrintSize } from "@/config/products";
import { DESIGN_WIDTH, buildMapStyle } from "@/components/map/build-map-style";
import { LAYOUT, TRIP_LAYOUT, posterHeight, tripMapRect } from "@/components/poster/poster-layout";
import { frameInWindow } from "@/lib/trip/fit";
import { type TripPlan, planTrip } from "@/lib/trip/plan";
import { type Box, type Placement, placePhotos } from "@/lib/trip/placement";
import { cropSquare } from "@/lib/trip/photos";
import {
  FontCache,
  baselineInLineBox,
  trackedWidth,
  wrapText,
  type FontBytesLoader,
  type PrintFont,
} from "./fonts";
import {
  type Ops,
  type PlacedTile,
  PRINT_RENDERER_VERSION,
  alphaState,
  append,
  colorOps,
  compileLayers,
  drawMapLayers,
  flush,
  hexToRgb,
} from "./render-pdf";
import {
  type Fetcher,
  type TileSource,
  coverTiles,
  fetchTile,
  loadTileSource,
  project,
  tileZoomFor,
} from "./tiles";

/**
 * TRIP PRINT RENDERER (layout B, "photos on the map"). One PDF page per print:
 * one page for a trip that fits, 2–3 for a split trip (see lib/trip/plan.ts).
 * Map drawing, tiles and fonts are the single-print renderer's own, so trip
 * maps look exactly like Atlas-style maps; everything trip-specific (route,
 * numbered markers, photos, names, break marks, overview) is drawn on top
 * from TRIP_LAYOUT geometry, the same numbers the on-screen preview uses.
 *
 * Not yet: canvas gallery wrap for trips, and the photo-strip fallback (a
 * crowded panel currently shows names only, and says so in `placements`).
 */

export interface TripRenderOptions {
  bleedIn?: number;
  fetcher?: Fetcher;
  loadFont: FontBytesLoader;
  /** Bytes of a customer photo. Defaults to fetching `photo.url`. */
  loadPhoto?: (photo: TripPhoto) => Promise<Uint8Array>;
  /** Preview only: draw a placeholder circle for stops that have no photo yet. */
  placeholderPhotos?: boolean;
  orderRef?: string;
  onProgress?: (step: string) => void;
}

export interface TripRenderResult {
  bytes: Uint8Array;
  fileName: string;
  widthIn: number;
  heightIn: number;
  bleedIn: number;
  /** Prints (PDF pages) in this trip. */
  pages: number;
  plan: TripPlan;
  /** How photos were placed on each print ("strip": too crowded; names only for now). */
  placements: Placement[];
  tileCount: number;
}

const KAPPA = 0.5522847498;

export async function renderTripPdf(
  design: TripDesign,
  opts: TripRenderOptions,
): Promise<TripRenderResult> {
  const { stops } = design;
  const fetcher = opts.fetcher ?? ((url: string) => fetch(url));
  const progress = opts.onProgress ?? (() => {});
  const style = getMapStyle(design.styleId);
  const cfg: MapStyleConfig = style.configuration;
  const size = getPrintSize(design.printSize);
  const finish = getFinish(design.finish);
  const bleedIn = opts.bleedIn ?? 0.125;

  const points = stops.map((s) => ({ lng: s.location.longitude, lat: s.location.latitude }));
  const plan = planTrip(points, size, style.id);

  const trimW = size.widthIn * 72;
  const trimH = size.heightIn * 72;
  const bleed = bleedIn * 72;
  const u = trimW / 100;
  const Hc = posterHeight(size.widthIn, size.heightIn);
  const X = (x: number) => bleed + x * u;
  const Y = (y: number) => bleed + trimH - y * u;
  const inToCq = (n: number) => (n / size.widthIn) * 100;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = new FontCache(doc, opts.loadFont);
  const titleFont = await fonts.get(cfg.titleFont, cfg.titleWeight);
  const bodyFont = await fonts.get(cfg.bodyFont, 400);
  const numberFont = await fonts.get("IBM Plex Mono", 500);

  progress("Loading map data");
  const mapStyle = buildMapStyle(cfg);
  const source = mapStyle.sources["omt"] as { url: string };
  const tileSource = await loadTileSource(source.url, fetcher);

  const images = new Map<string, PDFImage | null>();
  const imageFor = async (photo: TripPhoto | undefined) => {
    if (!photo) return null;
    if (!images.has(photo.key)) {
      const bytes = opts.loadPhoto
        ? await opts.loadPhoto(photo)
        : new Uint8Array(await (await fetcher(photo.url)).arrayBuffer());
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
      images.set(photo.key, isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes));
    }
    return images.get(photo.key) ?? null;
  };

  const placements: Placement[] = [];
  let tileCount = 0;
  const panels = plan.panels;

  for (let pi = 0; pi < panels.length; pi++) {
    const panel = panels[pi]!;
    const fit = panel.fit;
    const panelStops = stops.slice(panel.start, panel.end);
    progress(panels.length > 1 ? `Drawing print ${pi + 1} of ${panels.length}` : "Drawing map");

    const page = doc.addPage([trimW + 2 * bleed, trimH + 2 * bleed]);
    page.setMediaBox(0, 0, trimW + 2 * bleed, trimH + 2 * bleed);
    page.setBleedBox(0, 0, trimW + 2 * bleed, trimH + 2 * bleed);
    page.setTrimBox(bleed, bleed, trimW, trimH);
    const alphaCache = new Map<number, PDFName>();
    const ops: Ops = [];
    ops.push(
      colorOps(cfg.background, "fill"),
      rectangle(0, 0, trimW + 2 * bleed, trimH + 2 * bleed),
      fill(),
    );

    // ── Map ──
    const rect = tripMapRect(Hc);
    tileCount += await drawMap(page, ops, alphaCache, {
      rect,
      center: fit.center,
      zoom: fit.zoom,
      layers: mapStyle.layers,
      tileSource,
      fetcher,
      X,
      Y,
      u,
    });

    // Map window position of a point given in map inches.
    const at = (p: { x: number; y: number }) => ({
      x: rect.x + inToCq(p.x),
      y: rect.y + inToCq(p.y),
    });

    // The overview sits on the last print of a split trip; photos keep out of it.
    const O = TRIP_LAYOUT.overview;
    const showOverview = plan.overview !== null && pi === panels.length - 1;
    const overviewBox = { x: rect.x + O.inset, y: rect.y + O.inset, w: O.width, h: O.height };
    const obstacles: Box[] = showOverview
      ? [
          {
            x: ((overviewBox.x - rect.x) / 100) * size.widthIn,
            y: ((overviewBox.y - rect.y) / 100) * size.widthIn,
            w: (O.width / 100) * size.widthIn,
            h: (O.height / 100) * size.widthIn,
          },
        ]
      : [];

    // ── Photo placement ──
    const hasPhoto = (s: TripStop) => Boolean(s.photo) || Boolean(opts.placeholderPhotos);
    let placement = placePhotos({
      mapIn: fit.mapIn,
      positionsIn: fit.positionsIn,
      markerIn: fit.markerIn,
      widthIn: size.widthIn,
      stops: panelStops.map((s) => ({ label: s.label.toUpperCase(), hasPhoto: hasPhoto(s) })),
      obstacles,
    });
    placements.push(placement);
    if (placement.mode === "strip") {
      // TODO(strip): print the photos as a strip (layout A). For now: names only.
      placement = placePhotos({
        mapIn: fit.mapIn,
        positionsIn: fit.positionsIn,
        markerIn: fit.markerIn,
        widthIn: size.widthIn,
        stops: panelStops.map((s) => ({ label: s.label.toUpperCase(), hasPhoto: false })),
        obstacles,
      });
    }

    const markers = fit.positionsIn.map(at);
    const markerD = inToCq(fit.markerIn);

    // ── Route (inside the map window) ──
    ops.push(
      pushGraphicsState(),
      rectangle(X(rect.x), Y(rect.y + rect.height), rect.width * u, rect.height * u),
      clip(),
      endPath(),
    );
    if (markers.length > 1) {
      ops.push(
        colorOps(cfg.accent, "stroke"),
        setLineWidth(TRIP_LAYOUT.route.width * u),
        setLineCap(LineCapStyle.Round),
        setLineJoin(LineJoinStyle.Round),
      );
      markers.forEach((m, i) =>
        ops.push(i === 0 ? moveTo(X(m.x), Y(m.y)) : lineTo(X(m.x), Y(m.y))),
      );
      ops.push(stroke());
    }
    ops.push(popGraphicsState());

    if (placement.mode === "map") {
      // ── Leaders ──
      const Ld = TRIP_LAYOUT.leader;
      for (const s of placement.slots) {
        if (!s.leader) continue;
        const a = at(s.leader.from);
        const b = at(s.leader.to);
        ops.push(
          pushGraphicsState(),
          colorOps(cfg.label, "stroke"),
          setLineWidth(Ld.width * u),
          setLineCap(LineCapStyle.Round),
          setDashPattern([0, Ld.gap * u], 0),
          moveTo(X(a.x), Y(a.y)),
          lineTo(X(b.x), Y(b.y)),
          stroke(),
          popGraphicsState(),
        );
      }
      flush(page, ops);

      // ── Photos ──
      for (const s of placement.slots) {
        if (s.r <= 0) continue;
        const c = at(s.center);
        const r = inToCq(s.r);
        const ring = TRIP_LAYOUT.photo.ring;
        const img = await imageFor(panelStops[s.index]!.photo);
        if (img) {
          page.pushOperators(
            pushGraphicsState(),
            ...circleOps(X(c.x), Y(c.y), r * u),
            clip(),
            endPath(),
          );
          // The customer's chosen square of the photo fills the circle (see PhotoCrop).
          const sq = cropSquare(panelStops[s.index]!.photo!, img.width, img.height);
          const k = (2 * r * u) / sq.side;
          page.drawImage(img, {
            x: X(c.x) - sq.cx * k,
            y: Y(c.y) - (img.height - sq.cy) * k,
            width: img.width * k,
            height: img.height * k,
          });
          page.pushOperators(popGraphicsState());
        } else {
          // Placeholder (preview only): a quiet tint of the ink colour, distinct from water.
          ops.push(
            colorOps(cfg.background, "fill"),
            ...circleOps(X(c.x), Y(c.y), r * u),
            fill(),
            pushGraphicsState(),
            setGraphicsState(alphaState(page, alphaCache, 0.14)),
            colorOps(cfg.label, "fill"),
            ...circleOps(X(c.x), Y(c.y), r * u),
            fill(),
            popGraphicsState(),
          );
        }
        ops.push(
          pushGraphicsState(),
          colorOps(cfg.background, "stroke"),
          setLineWidth(ring * u),
          ...circleOps(X(c.x), Y(c.y), (r - ring / 2) * u),
          stroke(),
          popGraphicsState(),
        );
        flush(page, ops);
      }

      // ── Names ──
      const PL = TRIP_LAYOUT.photo.label;
      for (const s of placement.slots) {
        const box = { x: rect.x + inToCq(s.label.x), y: rect.y + inToCq(s.label.y) };
        const w = inToCq(s.label.w);
        const text = panelStops[s.index]!.label.toUpperCase();
        drawText(page, ops, alphaCache, {
          text,
          font: bodyFont,
          size: PL.size,
          spacing: 0.04 * PL.size,
          x: box.x + w / 2,
          baseline: box.y + baselineInLineBox(bodyFont.metrics, PL.size, PL.lineHeight),
          align: "center",
          color: cfg.label,
          opacity: 1,
          X,
          Y,
          u,
        });
      }
    }

    // ── Markers and numbers ──
    markers.forEach((m, i) => {
      const r = (markerD / 2) * u;
      ops.push(
        colorOps(cfg.label, "fill"),
        ...circleOps(X(m.x), Y(m.y), r),
        fill(),
        pushGraphicsState(),
        colorOps(cfg.background, "stroke"),
        setLineWidth(r * 0.18),
        ...circleOps(X(m.x), Y(m.y), r),
        stroke(),
        popGraphicsState(),
      );
      const n = String(panel.start + i + 1);
      const size = markerD * TRIP_LAYOUT.number.size;
      const asc = numberFont.metrics.ascent;
      const desc = numberFont.metrics.descent;
      drawText(page, ops, alphaCache, {
        text: n,
        font: numberFont,
        size,
        spacing: 0,
        x: m.x,
        // Optically centre the digits: baseline half the cap box below the centre.
        baseline: m.y + (size * (asc - Math.abs(desc))) / 2 - size * 0.08,
        align: "center",
        color: cfg.background,
        opacity: 1,
        X,
        Y,
        u,
      });
    });
    flush(page, ops);

    // ── Overview ──
    if (showOverview) {
      tileCount += await drawOverview(page, ops, alphaCache, {
        box: overviewBox,
        points,
        panels,
        cfg,
        layers: mapStyle.layers,
        tileSource,
        fetcher,
        bodyFont,
        widthIn: size.widthIn,
        X,
        Y,
        u,
      });
    }

    // ── Text band ──
    const T = TRIP_LAYOUT.text;
    const mapBottom = rect.y + rect.height;
    const left = LAYOUT.textInset;
    const width = 100 - 2 * LAYOUT.textInset;
    const titleSpacing = T.title.tracking * T.title.size;
    const lineSpacing = T.line.tracking * T.line.size;
    const titleLines = wrapText(
      titleFont.pdf,
      (design.title.trim() || " ").toUpperCase(),
      T.title.size,
      titleSpacing,
      width - titleSpacing,
    );
    const tripLine = (
      design.subtitle?.trim() ||
      autoTripLine(panelStops, pi, panels.length, panel.start, symbols(bodyFont))
    ).toUpperCase();
    const subLines = wrapText(
      bodyFont.pdf,
      tripLine,
      T.line.size,
      lineSpacing,
      width - lineSpacing,
    );
    const titleLH = T.title.size * T.title.lineHeight;
    const lineLH = T.line.size * T.line.lineHeight;
    const blockH = titleLines.length * titleLH + T.line.marginTop + subLines.length * lineLH;
    const bandTop = mapBottom;
    const bandBottom = Hc - T.breakMark.fromBottom - 1;
    let y = bandTop + Math.max(1, (bandBottom - bandTop - blockH) / 2);
    for (const t of titleLines) {
      drawText(page, ops, alphaCache, {
        text: t,
        font: titleFont,
        size: T.title.size,
        spacing: titleSpacing,
        x: 50 + titleSpacing / 2,
        baseline: y + baselineInLineBox(titleFont.metrics, T.title.size, T.title.lineHeight),
        align: "center",
        color: cfg.label,
        opacity: 1,
        X,
        Y,
        u,
      });
      y += titleLH;
    }
    y += T.line.marginTop;
    for (const t of subLines) {
      drawText(page, ops, alphaCache, {
        text: t,
        font: bodyFont,
        size: T.line.size,
        spacing: lineSpacing,
        x: 50 + lineSpacing / 2,
        baseline: y + baselineInLineBox(bodyFont.metrics, T.line.size, T.line.lineHeight),
        align: "center",
        color: cfg.subLabel,
        opacity: 1,
        X,
        Y,
        u,
      });
      y += lineLH;
    }

    // Break marks: where this print's leg meets the next / previous one.
    const B = T.breakMark;
    const bBase = Hc - B.fromBottom;
    const before = plan.breaks.find((b) => b.after === panel.start - 1);
    const after = plan.breaks.find((b) => b.after === panel.end - 1);
    if (before) {
      drawText(page, ops, alphaCache, {
        text: breakText("from", stops[before.after]!.label, before.km, symbols(bodyFont)),
        font: bodyFont,
        size: B.size,
        spacing: B.tracking * B.size,
        x: left,
        baseline: bBase,
        align: "left",
        color: cfg.label,
        opacity: 1,
        X,
        Y,
        u,
      });
    }
    if (after) {
      drawText(page, ops, alphaCache, {
        text: breakText("to", stops[after.after + 1]!.label, after.km, symbols(bodyFont)),
        font: bodyFont,
        size: B.size,
        spacing: B.tracking * B.size,
        x: left + width,
        baseline: bBase,
        align: "right",
        color: cfg.label,
        opacity: 1,
        X,
        Y,
        u,
      });
    }

    // Map credit, required by the OpenStreetMap and OpenMapTiles licences.
    const A = LAYOUT.attribution;
    drawText(page, ops, alphaCache, {
      text: A.text,
      font: bodyFont,
      size: A.size,
      spacing: A.tracking * A.size,
      x: 50,
      baseline: Hc - A.baselineFromBottom,
      align: "center",
      color: cfg.subLabel,
      opacity: A.opacity,
      X,
      Y,
      u,
    });
    flush(page, ops);
  }

  doc.setTitle(design.title);
  doc.setSubject(
    `${style.name} · ${size.label} in · ${finish.label} · trip of ${stops.length} stops on ${panels.length} print${panels.length > 1 ? "s" : ""}`,
  );
  doc.setCreator(`TripMyWay trip renderer v${PRINT_RENDERER_VERSION}`);
  doc.setProducer("TripMyWay");
  doc.setKeywords([
    `style:${style.id}`,
    `size:${size.id}`,
    `finish:${finish.id}`,
    `stops:${stops.length}`,
    `prints:${panels.length}`,
    ...(opts.orderRef ? [`order:${opts.orderRef}`] : []),
  ]);

  progress("Saving PDF");
  const bytes = await doc.save();
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
  const fileName = `${opts.orderRef ? `${slug(opts.orderRef)}_` : ""}${slug(design.title) || "trip"}_${style.id}_${size.id}${finish.id === "paper" ? "" : `_${finish.id}`}${panels.length > 1 ? `_${panels.length}-prints` : ""}.pdf`;
  return {
    bytes,
    fileName,
    widthIn: size.widthIn,
    heightIn: size.heightIn,
    bleedIn,
    pages: panels.length,
    plan,
    placements,
    tileCount,
  };
}

/** Which typographic symbols a print font can set; words stand in for missing ones. */
export interface Symbols {
  arrows: boolean;
  approx: boolean;
}

function symbols(font: PrintFont): Symbols {
  const set = new Set(font.pdf.getCharacterSet());
  return { arrows: set.has(0x2192) && set.has(0x2190), approx: set.has(0x2248) };
}

/** "From → To · N stops · dates", or for a split trip "Part 1 of 2 · From → To · stops 1–3". */
export function autoTripLine(
  panelStops: TripStop[],
  part: number,
  parts: number,
  start: number,
  sym: Symbols = { arrows: true, approx: true },
) {
  const first = panelStops[0]!;
  const last = panelStops[panelStops.length - 1]!;
  const route =
    panelStops.length > 1 ? `${first.label} ${sym.arrows ? "→" : "to"} ${last.label}` : first.label;
  const dates = [first.date, panelStops.length > 1 ? last.date : undefined].filter(Boolean);
  const when = dates.length ? ` · ${dates.join(" – ")}` : "";
  if (parts > 1) {
    const range =
      panelStops.length > 1
        ? `stops ${start + 1}–${start + panelStops.length}`
        : `stop ${start + 1}`;
    return `Part ${part + 1} of ${parts} · ${route} · ${range}${when}`;
  }
  // A location map (one place) names where it is; A to B needs no count; longer trips give one.
  if (panelStops.length === 1) return `${first.location.formattedAddress}${when}`;
  if (panelStops.length === 2) return `${route}${when}`;
  return `${route} · ${panelStops.length} stops${when}`;
}

/** Break mark: "≈ 8,300 km to Tokyo →" / "← From San Francisco · ≈ 8,300 km" (words when the font lacks the symbols). */
export function breakText(dir: "to" | "from", place: string, km: number, sym: Symbols) {
  const dist = `${sym.approx ? "≈" : "about"} ${formatKm(km)} km`;
  const text =
    dir === "to"
      ? `${dist} to ${place}${sym.arrows ? " →" : ""}`
      : `${sym.arrows ? "← " : ""}From ${place} · ${dist}`;
  return text.toUpperCase();
}

/** 8266 → "8,300"; 742 → "740". */
export function formatKm(km: number) {
  const step = km >= 1000 ? 100 : 10;
  return (Math.round(km / step) * step).toLocaleString("en-US");
}

// ─── Drawing helpers ─────────────────────────────────────────────────────────

type Coord = (n: number) => number;

function circleOps(cx: number, cy: number, r: number): Ops {
  const k = KAPPA * r;
  return [
    moveTo(cx + r, cy),
    appendBezierCurve(cx + r, cy + k, cx + k, cy + r, cx, cy + r),
    appendBezierCurve(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
    appendBezierCurve(cx - r, cy - k, cx - k, cy - r, cx, cy - r),
    appendBezierCurve(cx + k, cy - r, cx + r, cy - k, cx + r, cy),
    closePath(),
  ];
}

function drawText(
  page: PDFPage,
  ops: Ops,
  alphaCache: Map<number, PDFName>,
  t: {
    text: string;
    font: PrintFont;
    size: number;
    spacing: number;
    x: number;
    baseline: number;
    align: "left" | "center" | "right";
    color: string;
    opacity: number;
    X: Coord;
    Y: Coord;
    u: number;
  },
) {
  const w = trackedWidth(t.font.pdf, t.text, t.size, t.spacing);
  const x = t.align === "left" ? t.x : t.align === "right" ? t.x - w : t.x - w / 2;
  const fontKey = page.node.newFontDictionary(t.font.pdf.name, t.font.pdf.ref);
  const { r, g, b } = hexToRgb(t.color);
  ops.push(
    pushGraphicsState(),
    setGraphicsState(alphaState(page, alphaCache, t.opacity)),
    beginText(),
    setFillingRgbColor(r, g, b),
    setFontAndSize(fontKey, t.size * t.u),
    setCharacterSpacing(t.spacing * t.u),
    setTextMatrix(1, 0, 0, 1, t.X(x), t.Y(t.baseline)),
    showText(t.font.pdf.encodeText(t.text)),
    endText(),
    popGraphicsState(),
  );
}

/** Draws the map for `center`/`zoom` into `rect` (cqw). Returns the number of tiles with data. */
async function drawMap(
  page: PDFPage,
  ops: Ops,
  alphaCache: Map<number, PDFName>,
  m: {
    rect: { x: number; y: number; width: number; height: number };
    center: { lng: number; lat: number };
    zoom: number;
    layers: ReturnType<typeof buildMapStyle>["layers"];
    tileSource: TileSource;
    fetcher: Fetcher;
    X: Coord;
    Y: Coord;
    u: number;
  },
) {
  const { rect, X, Y, u } = m;
  const p = DESIGN_WIDTH / rect.width; // design px per cqw
  const canvas = { w: rect.width * p, h: rect.height * p };
  const center = project(m.center.lng, m.center.lat, m.zoom);
  const cover = coverTiles(center, canvas.w, canvas.h, m.zoom, tileZoomFor(m.zoom, m.tileSource));
  const tiles: PlacedTile[] = await Promise.all(
    cover.map(async (t) => ({
      tile: await fetchTile(m.tileSource, t.ref, m.fetcher),
      ox: t.ox,
      oy: t.oy,
      size: t.size,
    })),
  );
  const k = u / p;
  ops.push(pushGraphicsState());
  ops.push(concatTransformationMatrix(k, 0, 0, -k, X(rect.x), Y(rect.y)));
  ops.push(rectangle(0, 0, canvas.w, canvas.h), clip(), endPath());
  append(
    ops,
    drawMapLayers(page, alphaCache, compileLayers(m.layers, m.zoom), tiles, canvas, m.zoom),
  );
  ops.push(popGraphicsState());
  flush(page, ops);
  return tiles.filter((t) => t.tile).length;
}

/** Small whole-trip map: route and numbered dots, labelled "Whole trip". */
async function drawOverview(
  page: PDFPage,
  ops: Ops,
  alphaCache: Map<number, PDFName>,
  o: {
    box: { x: number; y: number; w: number; h: number };
    points: { lng: number; lat: number }[];
    panels: TripPlan["panels"];
    cfg: MapStyleConfig;
    layers: ReturnType<typeof buildMapStyle>["layers"];
    tileSource: TileSource;
    fetcher: Fetcher;
    bodyFont: PrintFont;
    widthIn: number;
    X: Coord;
    Y: Coord;
    u: number;
  },
) {
  const O = TRIP_LAYOUT.overview;
  const { box, cfg, X, Y, u } = o;
  const labelH = O.label.size + 2 * O.label.pad;
  const pad = O.padding;
  const mapRectCq = {
    x: box.x + pad,
    y: box.y + labelH,
    width: box.w - 2 * pad,
    height: box.h - labelH - pad,
  };
  const mapIn = { w: (mapRectCq.width / 100) * o.widthIn, h: (mapRectCq.height / 100) * o.widthIn };
  const framed = frameInWindow(o.points, mapIn, 0.18);

  ops.push(
    colorOps(cfg.background, "fill"),
    rectangle(X(box.x), Y(box.y + box.h), box.w * u, box.h * u),
    fill(),
  );
  const tiles = await drawMap(page, ops, alphaCache, {
    rect: mapRectCq,
    center: framed.center,
    zoom: framed.zoom,
    layers: o.layers,
    tileSource: o.tileSource,
    fetcher: o.fetcher,
    X,
    Y,
    u,
  });
  const at = (p: { x: number; y: number }) => ({
    x: mapRectCq.x + (p.x / o.widthIn) * 100,
    y: mapRectCq.y + (p.y / o.widthIn) * 100,
  });
  const pts = framed.positionsIn.map(at);
  ops.push(
    pushGraphicsState(),
    rectangle(
      X(mapRectCq.x),
      Y(mapRectCq.y + mapRectCq.height),
      mapRectCq.width * u,
      mapRectCq.height * u,
    ),
    clip(),
    endPath(),
    colorOps(cfg.accent, "stroke"),
    setLineWidth(O.route * u),
    setLineCap(LineCapStyle.Round),
    setLineJoin(LineJoinStyle.Round),
  );
  // Within a print's leg: a solid line; across a break: dashed.
  for (let i = 1; i < pts.length; i++) {
    const crossesBreak = o.panels.some((p) => p.start === i);
    const a = pts[i - 1]!;
    const b = pts[i]!;
    ops.push(
      setDashPattern(crossesBreak ? [O.route * 2.5 * u, O.route * 2.5 * u] : [], 0),
      moveTo(X(a.x), Y(a.y)),
      lineTo(X(b.x), Y(b.y)),
      stroke(),
    );
  }
  for (const p of pts)
    ops.push(colorOps(cfg.label, "fill"), ...circleOps(X(p.x), Y(p.y), (O.dot / 2) * u), fill());
  ops.push(popGraphicsState());

  // Frame and label.
  ops.push(
    pushGraphicsState(),
    colorOps(cfg.label, "stroke"),
    setLineWidth(O.border * u),
    rectangle(X(box.x), Y(box.y + box.h), box.w * u, box.h * u),
    stroke(),
    popGraphicsState(),
  );
  drawText(page, ops, alphaCache, {
    text: "WHOLE TRIP",
    font: o.bodyFont,
    size: O.label.size,
    spacing: O.label.tracking * O.label.size,
    x: box.x + O.label.pad,
    baseline: box.y + O.label.pad + O.label.size * 0.85,
    align: "left",
    color: cfg.label,
    opacity: 1,
    X,
    Y,
    u,
  });
  flush(page, ops);
  return tiles;
}
