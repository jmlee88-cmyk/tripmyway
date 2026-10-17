import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { Customization } from "@/types/product";
import { itemPanels, useCart } from "@/lib/cart";
import { getMapStyle } from "@/config/map-styles";
import { getFinish, getPrintSize } from "@/config/products";
import { generatePrintFile, type PrintFileResult } from "@/lib/print";
import { PosterPreview } from "@/components/poster/PosterPreview";
import { Button } from "@/components/ui/button";
import { PdfPagePreview } from "@/components/studio/PdfPagePreview";
import {
  BleedCornerDetail,
  BleedSheet,
  FitBox,
  bleedLabel,
} from "@/components/studio/BleedPreview";

/**
 * Internal print studio: turn a design into the print-ready PDF for the
 * fulfilment partner. Not linked from the site and excluded from search.
 * Designs come from this browser's cart or from pasted JSON (the
 * `customization` saved with an order).
 */
export const Route = createFileRoute("/studio/print")({
  head: () => ({
    meta: [
      { title: "Print studio | TripMyWay" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PrintStudio,
});

const BLEEDS = [
  { value: 0, label: "None", hint: "exact size" },
  { value: 0.125, label: "⅛″", hint: "standard" },
  { value: 0.25, label: "¼″", hint: "extra" },
];

function parseDesign(text: string): Customization | string {
  try {
    const raw = JSON.parse(text) as Partial<Customization> & { customization?: Customization };
    const c = (raw.customization ?? raw) as Customization;
    if (!c.location || typeof c.location.latitude !== "number")
      return "The design has no location.";
    if (!c.styleId || !c.printSize) return "The design is missing a style or print size.";
    return c;
  } catch {
    return "That isn't valid JSON.";
  }
}

function PrintStudio() {
  const items = useCart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [selected, setSelected] = useState<string>("");
  const [pasted, setPasted] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [bleedIn, setBleedIn] = useState(0.125);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    (PrintFileResult & { url: string; ms: number; designKey: string }) | null
  >(null);

  // A set contributes one entry per panel; each panel is its own print file.
  const designs = useMemo(
    () =>
      items.flatMap((it) => {
        const panels = itemPanels(it);
        return panels.map((c, i) => ({
          key: `${it.id}:${i}`,
          c,
          panel: panels.length > 1 ? { index: i, count: panels.length } : null,
        }));
      }),
    [items],
  );
  const current = designs.find((d) => d.key === selected) ?? designs[0];

  const design: Customization | string | null = useMemo(() => {
    if (pasted.trim()) return parseDesign(pasted);
    return current?.c ?? null;
  }, [pasted, current]);
  const panel = pasted.trim() ? null : (current?.panel ?? null);

  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );

  async function generate() {
    if (!design || typeof design === "string") return;
    setError(null);
    setResult(null);
    const t0 = performance.now();
    try {
      // Panels of a set are tagged in the file name and metadata, e.g. 1001-P2of3.
      const ref = [orderRef.trim(), panel ? `P${panel.index + 1}of${panel.count}` : ""]
        .filter(Boolean)
        .join("-");
      const res = await generatePrintFile(design, {
        bleedIn,
        onProgress: setProgress,
        ...(ref ? { orderRef: ref } : {}),
      });
      const url = URL.createObjectURL(
        new Blob([res.bytes as BlobPart], { type: "application/pdf" }),
      );
      setResult({ ...res, url, ms: performance.now() - t0, designKey: JSON.stringify(design) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  if (!mounted) return <div className="min-h-[60vh]" />;
  const valid = design && typeof design !== "string" ? design : null;

  const size = valid ? getPrintSize(valid.printSize) : null;
  const sheetAspect = size ? (size.widthIn + 2 * bleedIn) / (size.heightIn + 2 * bleedIn) : 3 / 4;
  const pdfAspect = result
    ? (result.widthIn + 2 * (result.bleedIn + result.wrapIn)) /
      (result.heightIn + 2 * (result.bleedIn + result.wrapIn))
    : sheetAspect;
  const stale =
    !!result && (result.designKey !== JSON.stringify(valid) || result.bleedIn !== bleedIn);

  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-12 md:px-10">
      <p className="eyebrow">Internal</p>
      <h1 className="mt-3 text-5xl">Print studio</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Generates the print-ready vector PDF for a design: drawn from the same map data, style and
        layout as the customer's preview, at the physical print size with fonts embedded.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
        <section className="space-y-8">
          <div>
            <h2 className="text-2xl">1. Design</h2>
            {designs.length > 0 ? (
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {designs.map((d) => {
                  const c = d.c;
                  const active = !pasted.trim() && d === current;
                  return (
                    <li key={d.key}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(d.key);
                          setPasted("");
                        }}
                        className={`flex w-full items-center gap-4 py-3 text-left ${active ? "" : "opacity-60 hover:opacity-100"}`}
                        aria-pressed={active}
                      >
                        <div className="w-14 shrink-0 bg-stage p-1">
                          <PosterPreview customization={c} className="w-full" />
                        </div>
                        <div className="min-w-0 text-sm">
                          <p className="truncate font-medium">
                            {d.panel && (
                              <span className="mr-2 text-xs uppercase tracking-widest text-muted-foreground">
                                Set · {d.panel.index + 1}/{d.panel.count}
                              </span>
                            )}
                            {c.title}
                          </p>
                          <p className="truncate text-muted-foreground">
                            {getMapStyle(c.styleId).name}
                            {c.layout === "fullBleed" ? " (edge to edge)" : ""} ·{" "}
                            {getPrintSize(c.printSize).label} in · {getFinish(c.finish).short} ·{" "}
                            {c.location?.formattedAddress}
                          </p>
                        </div>
                        {active && (
                          <span className="ml-auto text-xs uppercase tracking-widest">
                            Selected
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No designs in this browser's cart. Paste a design below, or add one from the Create
                page.
              </p>
            )}
            <label
              className="mt-6 block text-xs uppercase tracking-widest text-muted-foreground"
              htmlFor="design-json"
            >
              Or paste a design (JSON)
            </label>
            <textarea
              id="design-json"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder='{"location": {...}, "styleId": "vintage", "title": "...", ...}'
              className="mt-2 w-full border border-border bg-background p-3 font-mono text-xs"
            />
            {typeof design === "string" && (
              <p className="mt-2 text-sm text-destructive">{design}</p>
            )}
            {valid && (
              <button
                type="button"
                className="mt-2 text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground"
                onClick={() => navigator.clipboard?.writeText(JSON.stringify(valid, null, 2))}
              >
                Copy this design as JSON
              </button>
            )}
          </div>

          <div>
            <h2 className="text-2xl">2. Options</h2>
            <label
              className="mt-4 block text-xs uppercase tracking-widest text-muted-foreground"
              htmlFor="order-ref"
            >
              Order reference (optional)
            </label>
            <input
              id="order-ref"
              value={orderRef}
              onChange={(e) => setOrderRef(e.target.value)}
              placeholder="#1001"
              className="mt-2 w-full border-b border-border bg-transparent py-2 text-sm outline-none"
            />
            <fieldset className="mt-6">
              <legend className="text-xs uppercase tracking-widest text-muted-foreground">
                Bleed
              </legend>
              <div className="mt-2 flex gap-2">
                {BLEEDS.map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => setBleedIn(b.value)}
                    aria-pressed={bleedIn === b.value}
                    className={`border px-3 py-2 text-xs ${bleedIn === b.value ? "border-foreground bg-foreground text-background" : "border-border"}`}
                  >
                    {b.label} <span className="opacity-60">· {b.hint}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                The poster's colour already runs to every edge. Bleed is the extra margin of that
                colour printed past the edge so the print can be cut to size with no white sliver —
                this is how full-bleed (edge-to-edge) prints are made. Use ⅛″ unless your printer
                asks otherwise.
              </p>
            </fieldset>
          </div>

          <div>
            <Button
              variant="editorial"
              size="lg"
              disabled={!valid || !!progress}
              onClick={generate}
            >
              {progress ? `${progress}…` : "Generate print PDF"}
            </Button>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            {result && (
              <div className="mt-6 border-t border-border pt-6 text-sm">
                <p className="font-medium">{result.fileName}</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-muted-foreground">
                  <dt>Trim size</dt>
                  <dd>
                    {result.widthIn} × {result.heightIn} in
                  </dd>
                  <dt>Finish</dt>
                  <dd>{valid ? getFinish(valid.finish).label : "—"}</dd>
                  {result.wrapIn > 0 ? (
                    <>
                      <dt>Canvas wrap</dt>
                      <dd>
                        {result.wrapIn} in mirrored, each side (sheet{" "}
                        {result.widthIn + 2 * result.wrapIn} × {result.heightIn + 2 * result.wrapIn}{" "}
                        in)
                      </dd>
                    </>
                  ) : (
                    <>
                      <dt>Bleed</dt>
                      <dd>{result.bleedIn} in each side</dd>
                    </>
                  )}
                  <dt>File size</dt>
                  <dd>{(result.bytes.byteLength / 1024).toFixed(0)} KB · vector</dd>
                  <dt>Map tiles</dt>
                  <dd>{result.tileCount}</dd>
                  <dt>Rendered in</dt>
                  <dd>{(result.ms / 1000).toFixed(1)} s</dd>
                </dl>
                <a
                  href={result.url}
                  download={result.fileName}
                  className="mt-4 inline-block border border-foreground px-4 py-2 text-xs uppercase tracking-widest hover:bg-foreground hover:text-background"
                >
                  Download PDF
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Pinned on wide screens so the previews stay in view while the settings scroll. */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-[5.5rem] lg:h-[calc(100vh-7rem)] lg:self-start">
          <div className="grid h-[70vh] min-h-0 grid-cols-2 gap-4 lg:h-auto lg:flex-1">
            <figure className="flex min-h-0 flex-col">
              <figcaption className="mb-2 flex items-baseline justify-between gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                <span>Print sheet</span>
                <span>{bleedIn > 0 ? `${bleedLabel(bleedIn)} bleed` : "No bleed"}</span>
              </figcaption>
              <FitBox aspect={sheetAspect} className="flex-1 bg-stage p-4">
                {({ width }) =>
                  valid && <BleedSheet customization={valid} bleedIn={bleedIn} width={width} />
                }
              </FitBox>
            </figure>
            <figure className="flex min-h-0 flex-col">
              <figcaption className="mb-2 flex items-baseline justify-between gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                <span>Generated PDF</span>
                {stale ? (
                  <span className="text-destructive">Out of date</span>
                ) : (
                  result && (
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      Open full size
                    </a>
                  )
                )}
              </figcaption>
              <FitBox aspect={pdfAspect} className="flex-1 bg-stage p-4">
                {({ width, height }) =>
                  result ? (
                    <PdfPagePreview
                      bytes={result.bytes}
                      width={width}
                      height={height}
                      className={`bg-background shadow-print ${stale ? "opacity-40" : ""}`}
                    />
                  ) : (
                    <div
                      className="flex items-center justify-center border border-dashed border-border p-4 text-center text-xs text-muted-foreground"
                      style={{ width, height }}
                    >
                      {progress ? `${progress}…` : "Generate to preview the PDF"}
                    </div>
                  )
                }
              </FitBox>
            </figure>
          </div>
          {valid && <BleedCornerDetail customization={valid} bleedIn={bleedIn} />}
        </aside>
      </div>
    </div>
  );
}
