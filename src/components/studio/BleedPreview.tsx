import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Customization } from "@/types/product";
import { getMapStyle } from "@/config/map-styles";
import { getPrintSize } from "@/config/products";
import { LAYOUT, posterLayout } from "@/components/poster/poster-layout";
import { PosterPreview } from "@/components/poster/PosterPreview";

/**
 * Sizes its child to the largest box of the given aspect ratio that fits the
 * available space (the parent must give this element a definite height).
 */
export function FitBox({
  aspect,
  children,
  className,
}: {
  aspect: number;
  children: (size: { width: number; height: number }) => ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      // Content box: clientWidth/Height include padding.
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (!w || !h) return;
      const width = Math.min(w, h * aspect);
      setSize({ width, height: width / aspect });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);
  return (
    <div ref={ref} className={`flex min-h-0 items-center justify-center ${className ?? ""}`}>
      {size && children(size)}
    </div>
  );
}

const HATCH = (color: string) =>
  `repeating-linear-gradient(135deg, ${color} 0 1px, transparent 1px 5px)`;

/**
 * The printed sheet as the printer receives it: the poster at trim size plus
 * the bleed band around it, with the cut (trim) line dashed. Bleed is drawn at
 * true scale — the corner detail shows it enlarged.
 */
export function BleedSheet({
  customization,
  bleedIn,
  width,
}: {
  customization: Customization;
  bleedIn: number;
  width: number;
}) {
  const size = getPrintSize(customization.printSize);
  const bg = getMapStyle(customization.styleId).configuration.background;
  const sheetW = size.widthIn + 2 * bleedIn;
  const pad = (bleedIn / sheetW) * 100; // % of sheet width
  return (
    <div
      className="relative shadow-print"
      style={{
        width,
        aspectRatio: `${sheetW} / ${size.heightIn + 2 * bleedIn}`,
        background: bleedIn > 0 ? `${HATCH("rgba(196, 60, 40, 0.35)")}, ${bg}` : bg,
      }}
    >
      <div
        className="absolute"
        style={{ inset: `${(bleedIn / (size.heightIn + 2 * bleedIn)) * 100}% ${pad}%` }}
      >
        <PosterPreview customization={customization} className="h-full w-full" />
        {bleedIn > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ outline: "1px dashed rgba(196, 60, 40, 0.9)", outlineOffset: 0 }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Enlarged top-left corner of the sheet at a fixed scale (the same for every
 * bleed option, so ⅛″ and ¼″ compare directly): the bleed band that is
 * trimmed off, the cut line, and the printed poster inside it.
 */
export function BleedCornerDetail({
  customization,
  bleedIn,
}: {
  customization: Customization;
  bleedIn: number;
}) {
  const size = getPrintSize(customization.printSize);
  const style = getMapStyle(customization.styleId).configuration;
  const inch = 0.01 * LAYOUT.mapInset * size.widthIn; // map inset in inches
  const edge = posterLayout(customization) === "fullBleed";
  const px = 168;
  const s = px / 0.75; // the detail always shows ¾ inch: 224 px per inch
  const b = bleedIn * s;
  const red = "rgb(196, 60, 40)";
  const label = { fontSize: 8.5, letterSpacing: "0.12em", fontFamily: "Jost, sans-serif" };
  return (
    <figure className="flex items-start gap-4">
      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        role="img"
        aria-label="Enlarged corner of the print sheet"
        className="shrink-0 border border-border bg-background"
      >
        <defs>
          <pattern
            id="bleed-hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke={red} strokeOpacity="0.45" strokeWidth="1.5" />
          </pattern>
        </defs>
        {/* The printed sheet: poster area plus bleed, all in the paper colour. */}
        <rect width={px} height={px} fill={style.background} />
        {edge && (
          // Edge to edge: the map itself runs through the cut into the bleed.
          <g fill="none" strokeLinecap="round">
            <path
              d="M -5 52 L 175 30 M -5 118 L 175 96 M 40 -5 L 58 175 M 112 -5 L 128 175"
              stroke={style.minorRoad}
              strokeWidth="1.5"
            />
            <path
              d="M -5 150 L 175 70 M 84 -5 L 92 175"
              stroke={style.primaryRoad}
              strokeWidth="3"
            />
          </g>
        )}
        {bleedIn > 0 && (
          <>
            <rect width={px} height={b} fill="url(#bleed-hatch)" />
            <rect y={b} width={b} height={px - b} fill="url(#bleed-hatch)" />
            <text x={b + 8} y={b / 2 + 3} fill={red} style={label}>
              BLEED
            </text>
          </>
        )}
        <text x={b + 10} y={b + 24} fill={edge ? style.label : style.subLabel} style={label}>
          {edge ? "MAP" : "POSTER"}
        </text>
        {bleedIn > 0 ? (
          <path
            d={`M ${b} ${px} V ${b} H ${px}`}
            fill="none"
            stroke={red}
            strokeWidth="1.25"
            strokeDasharray="4 3"
          />
        ) : (
          <path d={`M 0.75 ${px} V 0.75 H ${px}`} fill="none" stroke={red} strokeWidth="1.5" />
        )}
      </svg>
      <figcaption className="space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p className="text-[0.65rem] uppercase tracking-widest text-foreground">Corner, enlarged</p>
        {bleedIn > 0 ? (
          <>
            <p>
              <span
                className="mr-1.5 inline-block h-2.5 w-2.5 align-middle"
                style={{ background: HATCH("rgba(196,60,40,0.55)") }}
              />
              <strong className="font-medium text-foreground">
                Bleed, {bleedLabel(bleedIn)} each side.
              </strong>{" "}
              {edge
                ? "The map itself continues past the edge and is trimmed off, so a slightly off cut still ends on map, never a sliver of background."
                : "Background colour printed past the edge and trimmed off, so a slightly off cut never leaves a white sliver."}
            </p>
            <p>
              <span
                className="mr-1.5 inline-block w-3 border-t border-dashed align-middle"
                style={{ borderColor: red }}
              />
              <strong className="font-medium text-foreground">Trim line.</strong> Where the sheet is
              cut to {size.widthIn} × {size.heightIn} in.
            </p>
            <p>
              Printer receives {fmt(size.widthIn + 2 * bleedIn)} ×{" "}
              {fmt(size.heightIn + 2 * bleedIn)} in.{" "}
              {edge
                ? "Map runs to the cut on the top and both sides."
                : `Map starts ${fmt(inch)} in inside the cut.`}
            </p>
          </>
        ) : (
          <>
            <p>
              <strong className="font-medium text-foreground">No bleed.</strong> The file is exactly{" "}
              {size.widthIn} × {size.heightIn} in and the edge is the cut.
            </p>
            <p>
              {edge
                ? "Not recommended for edge-to-edge maps: unless the printer adds its own bleed, any cutting error shows as a line of background along the map's edge."
                : "Use only if the printer prints edge to edge without trimming, or adds bleed itself — otherwise a slightly off cut can leave a thin unprinted line."}
            </p>
          </>
        )}
      </figcaption>
    </figure>
  );
}

export function bleedLabel(inches: number) {
  if (inches === 0.125) return "⅛″";
  if (inches === 0.25) return "¼″";
  return `${inches}″`;
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "");
}
