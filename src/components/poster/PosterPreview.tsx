import { useEffect } from "react";
import type { Customization, MapStyleConfig, MarkerStyle } from "@/types/product";
import { getMapStyle } from "@/config/map-styles";
import { ZOOM_LEVELS, getFinish, getPrintSize } from "@/config/products";
import { MapRenderer } from "@/components/map/MapRenderer";
import { track } from "@/lib/analytics";
import { FinishSurface, finishSurfaceStyle } from "./FinishSurface";
import {
  LAYOUT,
  PIN_PATH,
  applyCase,
  footerLine,
  hasRule,
  mapRect,
  posterHeight,
  posterLayout,
  showsFrame,
} from "./poster-layout";

const cq = (n: number) => `${n}cqw`;

/**
 * SCREEN PREVIEW of the finished print. Sized with container-query units so
 * the composition is identical at any rendered size. All geometry comes from
 * poster-layout.ts, which the print renderer (src/print) also uses.
 */
export function PosterPreview({
  customization,
  className,
  trackPreview,
  inFrame,
}: {
  customization: Customization;
  className?: string | undefined;
  trackPreview?: boolean | undefined;
  /** Inside a frame (FramedPoster): the frame casts the shadow, not the print. */
  inFrame?: boolean;
}) {
  const style = getMapStyle(customization.styleId);
  const c = style.configuration;
  const size = getPrintSize(customization.printSize);
  const zoom = ZOOM_LEVELS.find((z) => z.id === customization.zoomLevel)?.zoom ?? 12;
  const footer = footerLine(customization);
  const L = LAYOUT;
  const layout = posterLayout(customization);
  const rect = mapRect(posterHeight(size.widthIn, size.heightIn), layout);
  const finish = getFinish(customization.finish);

  useEffect(() => {
    if (!trackPreview) return;
    const t = setTimeout(
      () => track("preview_generated", { style: style.id, size: size.id, finish: finish.id }),
      800,
    );
    return () => clearTimeout(t);
  }, [
    trackPreview,
    style.id,
    size.id,
    finish.id,
    customization.location?.id,
    customization.zoomLevel,
  ]);

  return (
    <div
      className={className}
      style={{
        aspectRatio: `${size.widthIn} / ${size.heightIn}`,
        background: c.background,
        containerType: "inline-size",
        position: "relative",
        transition: "background 400ms ease, box-shadow 400ms ease, border-radius 400ms ease",
        ...finishSurfaceStyle(finish.id),
        ...(inFrame ? { boxShadow: "none" } : {}),
      }}
      role="img"
      aria-label={`Map print preview: ${customization.title}, ${customization.subtitle}, ${style.name} style, ${size.label} inches${finish.id === "paper" ? "" : `, ${finish.label}`}`}
    >
      <div
        style={{
          position: "absolute",
          left: cq(rect.x),
          right: cq(100 - rect.x - rect.width),
          top: cq(rect.y),
          bottom: cq(L.textBandHeight),
          overflow: "hidden",
        }}
      >
        {customization.location && (
          <MapRenderer
            location={customization.location}
            zoom={zoom}
            style={c}
            className="h-full w-full"
          />
        )}
        {c.border === "grid" && <GridOverlay color={c.label} />}
        {customization.markerStyle !== "none" && (
          <Marker kind={customization.markerStyle} config={c} />
        )}
      </div>
      {showsFrame(c, layout) && <Border config={c} />}
      <div
        style={{
          position: "absolute",
          left: cq(L.textInset),
          right: cq(L.textInset),
          bottom: 0,
          height: cq(L.textBandHeight),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          color: c.label,
        }}
      >
        <div
          style={{
            fontFamily: `"${c.titleFont}", serif`,
            fontWeight: c.titleWeight,
            letterSpacing: c.titleTracking,
            fontSize: cq(L.title.size),
            lineHeight: L.title.lineHeight,
            paddingLeft: c.titleTracking,
            overflowWrap: "anywhere",
          }}
        >
          {applyCase(customization, customization.title) || " "}
        </div>
        {hasRule(c) ? (
          <div
            style={{
              width: cq(L.rule.width),
              height: cq(L.rule.thickness),
              background: c.accent,
              margin: `${cq(L.rule.marginTop)} 0 ${cq(L.rule.marginBottom)}`,
              opacity: L.rule.opacity,
              flexShrink: 0,
            }}
          />
        ) : (
          <div style={{ height: cq(L.plainGap), flexShrink: 0 }} />
        )}
        <div
          style={{
            fontFamily: `"${c.bodyFont}", sans-serif`,
            color: c.subLabel,
            letterSpacing: `${L.subtitle.tracking}em`,
            fontSize: cq(L.subtitle.size),
            lineHeight: L.subtitle.lineHeight,
            paddingLeft: `${L.subtitle.tracking}em`,
            overflowWrap: "anywhere",
          }}
        >
          {applyCase(customization, customization.subtitle)}
        </div>
        {footer && (
          <div
            style={{
              fontFamily: `"${c.bodyFont}", sans-serif`,
              color: c.subLabel,
              letterSpacing: `${L.footer.tracking}em`,
              fontSize: cq(L.footer.size),
              lineHeight: L.footer.lineHeight,
              marginTop: cq(L.footer.marginTop),
              opacity: L.footer.opacity,
            }}
          >
            {footer}
          </div>
        )}
      </div>
      <Attribution config={c} />
      <FinishSurface finish={finish.id} widthIn={size.widthIn} />
    </div>
  );
}

function Attribution({ config }: { config: MapStyleConfig }) {
  const a = LAYOUT.attribution;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        // The line box is 1em tall; put its baseline (~0.8em down) at baselineFromBottom.
        bottom: cq(a.baselineFromBottom - a.size * 0.2),
        textAlign: "center",
        fontFamily: `"${config.bodyFont}", sans-serif`,
        fontSize: cq(a.size),
        lineHeight: 1,
        letterSpacing: `${a.tracking}em`,
        paddingLeft: `${a.tracking}em`,
        color: config.subLabel,
        opacity: a.opacity,
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {a.text}
    </div>
  );
}

function Border({ config }: { config: MapStyleConfig }) {
  if (config.border === "none") return null;
  const base = { position: "absolute" as const, pointerEvents: "none" as const };
  const b = LAYOUT.border;
  if (config.border === "double")
    return (
      <>
        <div
          style={{
            ...base,
            inset: cq(b.double.outer.inset),
            border: `${cq(b.double.outer.width)} solid ${config.label}`,
            opacity: b.double.outer.opacity,
          }}
        />
        <div
          style={{
            ...base,
            inset: cq(b.double.inner.inset),
            border: `${cq(b.double.inner.width)} solid ${config.label}`,
            opacity: b.double.inner.opacity,
          }}
        />
      </>
    );
  return (
    <div
      style={{
        ...base,
        inset: cq(b.hairline.inset),
        border: `${cq(b.hairline.width)} solid ${config.label}`,
        opacity: b.hairline.opacity,
      }}
    />
  );
}

function GridOverlay({ color }: { color: string }) {
  const g = LAYOUT.grid;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity: g.opacity,
        backgroundImage: `linear-gradient(${color} ${cq(g.width)}, transparent ${cq(g.width)}), linear-gradient(90deg, ${color} ${cq(g.width)}, transparent ${cq(g.width)})`,
        backgroundSize: `${cq(g.spacing)} ${cq(g.spacing)}`,
        backgroundPosition: "center",
        boxShadow: `inset 0 0 0 ${cq(g.width)} ${color}`,
      }}
    />
  );
}

function Marker({ kind, config }: { kind: MarkerStyle; config: MapStyleConfig }) {
  const pos = {
    position: "absolute" as const,
    left: "50%",
    top: "50%",
    pointerEvents: "none" as const,
  };
  const m = LAYOUT.marker;
  if (kind === "dot")
    return (
      <svg
        viewBox={`0 0 ${m.dot.viewBox} ${m.dot.viewBox}`}
        style={{ ...pos, width: cq(m.dot.width), transform: "translate(-50%, -50%)" }}
        aria-hidden
      >
        <circle
          cx="20"
          cy="20"
          r="17"
          fill="none"
          stroke={config.accent}
          strokeWidth="1.5"
          opacity="0.6"
        />
        <circle
          cx="20"
          cy="20"
          r="6"
          fill={config.accent}
          stroke={config.background}
          strokeWidth="2"
        />
      </svg>
    );
  return (
    <svg
      viewBox={`0 0 ${m.pin.viewBoxWidth} ${m.pin.viewBoxHeight}`}
      style={{ ...pos, width: cq(m.pin.width), transform: "translate(-50%, -100%)" }}
      aria-hidden
    >
      <path d={PIN_PATH} fill={config.accent} stroke={config.background} strokeWidth="1.5" />
      <circle cx="15" cy="15" r="4.5" fill={config.background} />
    </svg>
  );
}
