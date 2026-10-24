import { Lightbulb } from "lucide-react";
import type { PrintSizeId } from "@/types/product";
import { getPrintSize } from "@/config/products";
import { SCALE_SOFA, SET_GAP_IN, SIZE_GUIDES, wallWidthIn } from "@/config/guides";

/**
 * A to-scale sketch: the print (or set) hung above a typical 3-seat sofa, so
 * "18 × 24" means something. Every length is in inches.
 */
function ScaleSketch({ sizeId, prints }: { sizeId: PrintSizeId; prints: number }) {
  const s = getPrintSize(sizeId);
  const span = wallWidthIn(sizeId, prints);
  const sofa = SCALE_SOFA;
  const width = Math.max(span, sofa.widthIn) + 16;
  const height = sofa.heightIn + sofa.gapAboveIn + 48 + 8; // tallest print is 48″
  const cx = width / 2;
  const floor = height;
  const sofaTop = floor - sofa.heightIn;
  const artBottom = sofaTop - sofa.gapAboveIn;
  const left = cx - span / 2;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full max-w-[220px]"
      role="img"
      aria-label={`${s.label} inch print${prints > 1 ? ` set of ${prints}` : ""} drawn to scale above an ${sofa.widthIn} inch sofa`}
    >
      {Array.from({ length: prints }, (_, i) => (
        <rect
          key={i}
          x={left + i * (s.widthIn + SET_GAP_IN)}
          y={artBottom - s.heightIn}
          width={s.widthIn}
          height={s.heightIn}
          rx={0.6}
          className="fill-[var(--land)] stroke-foreground"
          strokeWidth={1}
        />
      ))}
      {/* sofa: back, seat and arms */}
      <g className="fill-foreground/15 stroke-foreground/60" strokeWidth={0.8}>
        <rect
          x={cx - sofa.widthIn / 2 + 6}
          y={sofaTop}
          width={sofa.widthIn - 12}
          height={18}
          rx={3}
        />
        <rect
          x={cx - sofa.widthIn / 2 + 6}
          y={sofaTop + 16}
          width={sofa.widthIn - 12}
          height={12}
          rx={2}
        />
        <rect x={cx - sofa.widthIn / 2} y={sofaTop + 8} width={8} height={22} rx={3} />
        <rect x={cx + sofa.widthIn / 2 - 8} y={sofaTop + 8} width={8} height={22} rx={3} />
      </g>
      <line
        x1={0}
        x2={width}
        y1={floor - 0.5}
        y2={floor - 0.5}
        className="stroke-foreground/30"
        strokeWidth={1}
      />
    </svg>
  );
}

/**
 * The floating bubble under the size buttons: what the size under the pointer
 * (or the selected one) is good for, where it goes, and how big it really is.
 */
export function SizeGuideBubble({
  sizeId,
  prints,
  previewing,
  anchorX,
}: {
  sizeId: PrintSizeId;
  prints: number;
  /** True while the customer is hovering or focusing a size they haven't picked. */
  previewing: boolean;
  /** Pixels from the bubble's left edge to the size button it describes. */
  anchorX?: number | null;
}) {
  const s = getPrintSize(sizeId);
  const g = SIZE_GUIDES[sizeId];
  const span = wallWidthIn(sizeId, prints);
  return (
    <div
      role="note"
      aria-live="polite"
      className="relative mt-3 rounded-2xl border border-foreground/10 bg-sea/60 p-4 shadow-[0_6px_20px_-12px_rgba(27,42,65,0.45)]"
    >
      <span
        aria-hidden
        style={{ left: `${anchorX ?? 32}px` }}
        className="absolute -top-[7px] -translate-x-1/2 transition-[left] duration-150 h-3 w-3 rotate-45 border-l border-t border-foreground/10 bg-[color-mix(in_srgb,var(--sea)_60%,var(--background))]"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Lightbulb className="h-4 w-4 shrink-0 text-ochre" aria-hidden />
            {s.label} in{prints > 1 ? `, set of ${prints}` : ""}
            {previewing ? (
              <span className="font-normal text-muted-foreground"> · previewing</span>
            ) : null}
          </p>
          <p className="mt-1.5 text-sm">{g.goodFor}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {g.placement} {g.viewing}
          </p>
          {prints > 1 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Hung side by side with {SET_GAP_IN}″ gaps, the set is about {span}″ wide and{" "}
              {s.heightIn}″ tall.
            </p>
          ) : null}
        </div>
        <figure className="shrink-0 sm:w-[190px]">
          <ScaleSketch sizeId={sizeId} prints={prints} />
          <figcaption className="mt-1 text-[11px] text-muted-foreground">
            To scale above an {SCALE_SOFA.widthIn}″ sofa
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
