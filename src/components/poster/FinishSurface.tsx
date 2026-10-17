import type { CSSProperties } from "react";
import type { PrintFinish } from "@/types/product";

/**
 * SCREEN LOOK of each print finish, layered over the poster preview. Paper is
 * the original look and adds nothing. Physical details (the canvas roll, the
 * acrylic's polished edge) are sized in inches of the real print, converted to
 * container units, so they read correctly at every print size.
 *
 * This is presentation only: the map and lettering underneath are untouched,
 * and the print file is not affected (see src/print for canvas wrap).
 */

/** Container width units for `inches` on a print `widthIn` wide, never below `minPx`. */
const inch = (inches: number, widthIn: number, minPx = 0) =>
  `max(${minPx}px, ${((inches / widthIn) * 100).toFixed(3)}cqw)`;

/**
 * Extra styles for the poster's outer box. The box is itself the size
 * container, so container units here would measure the page instead of the
 * print: edges and shadows use fixed pixels (the overlays below use inches).
 */
export function finishSurfaceStyle(finish: PrintFinish): CSSProperties {
  switch (finish) {
    case "canvas":
      return {
        boxShadow: [
          // The 1.5" frame's side, seen slightly from the left and above.
          "1px 1px 0 rgba(30,26,22,0.10)",
          "2px 3px 0 rgba(30,26,22,0.07)",
          "0 10px 28px rgba(30,26,22,0.32)",
          "0 2px 5px rgba(30,26,22,0.22)",
        ].join(", "),
      };
    case "metal":
      return {
        borderRadius: "3px",
        overflow: "hidden",
        filter: "saturate(1.08) contrast(1.04)",
        boxShadow: [
          // Floats off the wall on a hidden mount.
          "0 22px 40px -8px rgba(30,26,22,0.40)",
          "0 3px 6px rgba(30,26,22,0.18)",
        ].join(", "),
      };
    case "acrylic":
      return {
        borderRadius: "2px",
        overflow: "hidden",
        filter: "saturate(1.14) contrast(1.06)",
        boxShadow: [
          // A fine polished edge, then the shadow of a print hung close to the wall.
          "0 0 0 1px rgba(255,255,255,0.75)",
          "0 0 0 2px rgba(30,26,22,0.08)",
          "0 20px 38px -8px rgba(30,26,22,0.38)",
          "0 4px 8px rgba(30,26,22,0.18)",
        ].join(", "),
      };
    default:
      return {};
  }
}

/** Overlays drawn above the artwork. */
export function FinishSurface({ finish, widthIn }: { finish: PrintFinish; widthIn: number }) {
  const i = (n: number, min = 0) => inch(n, widthIn, min);
  const layer: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };
  if (finish === "canvas")
    return (
      <>
        {/* Woven texture */}
        <div
          aria-hidden
          style={{
            ...layer,
            mixBlendMode: "multiply",
            opacity: 0.55,
            backgroundImage: [
              "repeating-linear-gradient(0deg, rgba(60,50,40,0.07) 0 1px, transparent 1px 3px)",
              "repeating-linear-gradient(90deg, rgba(60,50,40,0.06) 0 1px, transparent 1px 3px)",
            ].join(", "),
          }}
        />
        {/* Soft light across the slightly uneven surface */}
        <div
          aria-hidden
          style={{
            ...layer,
            mixBlendMode: "soft-light",
            background:
              "linear-gradient(160deg, rgba(255,255,255,0.18), rgba(255,255,255,0) 45%, rgba(0,0,0,0.06))",
          }}
        />
        {/* The canvas rolling over the frame edge */}
        <div
          aria-hidden
          style={{
            ...layer,
            boxShadow: `inset ${i(-0.06, -1)} ${i(-0.06, -1)} ${i(0.12, 2)} rgba(0,0,0,0.16), inset ${i(0.05, 1)} ${i(0.05, 1)} ${i(0.1, 1)} rgba(255,255,255,0.35)`,
          }}
        />
      </>
    );
  if (finish === "metal")
    return (
      <>
        <div
          aria-hidden
          style={{
            ...layer,
            borderRadius: "inherit",
            mixBlendMode: "screen",
            background:
              "linear-gradient(115deg, rgba(255,255,255,0) 22%, rgba(255,255,255,0.32) 42%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0) 62%)",
          }}
        />
        <div
          aria-hidden
          style={{
            ...layer,
            borderRadius: "inherit",
            mixBlendMode: "multiply",
            background:
              "linear-gradient(115deg, rgba(0,0,0,0) 55%, rgba(60,55,50,0.10) 75%, rgba(0,0,0,0) 95%)",
          }}
        />
      </>
    );
  if (finish === "acrylic")
    return (
      <>
        {/* Gloss across the acrylic face */}
        <div
          aria-hidden
          style={{
            ...layer,
            borderRadius: "inherit",
            mixBlendMode: "screen",
            background: [
              "linear-gradient(125deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.08) 32%, rgba(255,255,255,0) 33%)",
              "linear-gradient(125deg, rgba(255,255,255,0) 58%, rgba(255,255,255,0.10) 59%, rgba(255,255,255,0) 72%)",
            ].join(", "),
          }}
        />
        {/* Polished front edge */}
        <div
          aria-hidden
          style={{
            ...layer,
            borderRadius: "inherit",
            boxShadow: `inset 0 0 0 ${i(0.03, 1)} rgba(255,255,255,0.7), inset 0 ${i(0.2, 2)} ${i(0.5, 5)} rgba(255,255,255,0.12)`,
          }}
        />
      </>
    );
  return null;
}
