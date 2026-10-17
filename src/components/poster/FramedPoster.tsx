import type { CSSProperties } from "react";
import type { Customization, FrameColor } from "@/types/product";
import { FRAME_STYLES, getFinish, getFrame, getPrintSize } from "@/config/products";
import { PosterPreview } from "./PosterPreview";

/**
 * SCREEN PREVIEW of a print in its optional frame (ArtBeat profiles, see
 * FRAME_STYLES). Unframed designs render PosterPreview unchanged.
 *
 * - Float frame (canvas, metal, acrylic): a slim face with a shadow gap all
 *   round, so the art seems to float inside it.
 * - Box frame (paper): a wider face sitting on the print, covering ⅛″ of each
 *   edge, with glazing in front.
 *
 * Sizes are in inches of the real piece and expressed as percentages, so the
 * frame keeps true proportions at any rendered size. The outer box must fill
 * its parent's width (padding percentages refer to it).
 */

/** Outer size of the finished piece in inches, frame included. */
export function framedSizeIn(c: Customization): { widthIn: number; heightIn: number } {
  const size = getPrintSize(c.printSize);
  if (getFrame(c) === "none") return { widthIn: size.widthIn, heightIn: size.heightIn };
  const s = FRAME_STYLES[getFinish(c.finish).id];
  const extra = 2 * (s.faceIn + s.gapIn - s.overlapIn);
  return { widthIn: size.widthIn + extra, heightIn: size.heightIn + extra };
}

/** Colour of the frame face (with a little grain or sheen where the material has it). */
const FACE: Record<Exclude<FrameColor, "none">, string> = {
  white: "linear-gradient(135deg, #fbfaf7, #ebe8e2)",
  black: "linear-gradient(135deg, #2a2725, #121110)",
  natural:
    "repeating-linear-gradient(100deg, rgba(120,84,44,0.08) 0 2px, transparent 2px 6px), linear-gradient(135deg, #e2cba5, #c9a877)",
  gold: "linear-gradient(135deg, #a8843f 0%, #e8d293 38%, #b8954f 62%, #f0dea5 82%, #a07a35 100%)",
  silver:
    "linear-gradient(135deg, #8e9195 0%, #e9ebee 38%, #a5a8ac 62%, #f2f3f5 82%, #8a8d91 100%)",
};

/** The inside wall of a float frame, seen in shadow through the gap. */
const GAP: Record<Exclude<FrameColor, "none">, string> = {
  white: "linear-gradient(135deg, #a9a49d, #d6d2cb)",
  black: "#0d0c0b",
  natural: "linear-gradient(135deg, #8a6c45, #b8976a)",
  gold: "#6e5527",
  silver: "#6f7276",
};

export function FramedPoster({
  customization,
  className,
  trackPreview,
}: {
  customization: Customization;
  className?: string | undefined;
  trackPreview?: boolean | undefined;
}) {
  const color = getFrame(customization);
  if (color === "none")
    return (
      <PosterPreview
        customization={customization}
        className={className}
        trackPreview={trackPreview}
      />
    );

  const size = getPrintSize(customization.printSize);
  const s = FRAME_STYLES[getFinish(customization.finish).id];
  const { widthIn: outerW } = framedSizeIn(customization);
  const pct = (inches: number, ofIn: number) => `${(inches / ofIn) * 100}%`;
  const outer: CSSProperties = {
    position: "relative",
    background: FACE[color],
    boxShadow: [
      "inset 0 0 0 1px rgba(0,0,0,0.14)",
      "0 18px 34px -8px rgba(30,26,22,0.38)",
      "0 3px 7px rgba(30,26,22,0.2)",
    ].join(", "),
  };
  const label = `${customization.title} in a ${color} ${s.label.toLowerCase()}`;

  if (s.id === "float") {
    const innerW = size.widthIn + 2 * s.gapIn;
    return (
      <div
        className={className}
        style={{ ...outer, padding: pct(s.faceIn, outerW), boxShadow: outer.boxShadow }}
        role="group"
        aria-label={label}
      >
        <div
          style={{
            padding: pct(s.gapIn, innerW),
            background: GAP[color],
            // Depth of the channel between frame and art.
            boxShadow: "inset 0 2px 5px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(0,0,0,0.25)",
          }}
        >
          <PosterPreview
            customization={customization}
            trackPreview={trackPreview}
            inFrame
            className="w-full"
          />
        </div>
      </div>
    );
  }

  // Box frame: the face sits on the print, covering `overlapIn` of each edge.
  const visibleFace = s.faceIn - s.overlapIn;
  const ox = pct(s.overlapIn, size.widthIn);
  const oy = pct(s.overlapIn, size.heightIn);
  const strip: CSSProperties = {
    position: "absolute",
    background: FACE[color],
    pointerEvents: "none",
  };
  return (
    <div
      className={className}
      style={{ ...outer, padding: pct(visibleFace, outerW) }}
      role="group"
      aria-label={label}
    >
      <div style={{ position: "relative" }}>
        <PosterPreview
          customization={customization}
          trackPreview={trackPreview}
          inFrame
          className="w-full"
        />
        {/* Frame lip over the print's edges */}
        <div aria-hidden style={{ ...strip, left: 0, right: 0, top: 0, height: oy }} />
        <div aria-hidden style={{ ...strip, left: 0, right: 0, bottom: 0, height: oy }} />
        <div aria-hidden style={{ ...strip, top: 0, bottom: 0, left: 0, width: ox }} />
        <div aria-hidden style={{ ...strip, top: 0, bottom: 0, right: 0, width: ox }} />
        {/* The frame's depth shading the art, and the glazing in front of it */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: ox,
            right: ox,
            top: oy,
            bottom: oy,
            pointerEvents: "none",
            boxShadow: "inset 0 3px 6px rgba(0,0,0,0.28), inset 0 0 2px rgba(0,0,0,0.35)",
            background:
              "linear-gradient(125deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0) 31%), linear-gradient(125deg, rgba(255,255,255,0) 62%, rgba(255,255,255,0.08) 63%, rgba(255,255,255,0) 74%)",
          }}
        />
      </div>
    </div>
  );
}
