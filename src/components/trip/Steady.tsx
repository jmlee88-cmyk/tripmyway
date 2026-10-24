import type { ReactNode } from "react";

/**
 * Shows one of several texts without the layout jumping: every variant sits in
 * the same grid cell, so the box is always as tall as the longest one, and only
 * the active variant is visible (the others are hidden from screen readers).
 */
export function Steady<K extends string>({
  active,
  variants,
}: {
  active: K;
  variants: { key: K; node: ReactNode }[];
}) {
  return (
    <div className="grid">
      {variants.map((v) => (
        <div
          key={v.key}
          aria-hidden={v.key !== active}
          className={`[grid-area:1/1] ${v.key === active ? "" : "invisible"}`}
        >
          {v.node}
        </div>
      ))}
    </div>
  );
}
