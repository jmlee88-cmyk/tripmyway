import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { TripDesign } from "@/types/trip";
import { useCart } from "@/lib/cart";
import { parseTripDesign, tripPrintCount, tripLineItemProperties } from "@/lib/trip-cart";
import { generateTripPrintFile } from "@/lib/trip-print";
import { getPrintSize } from "@/config/products";
import { PdfPagePreview } from "@/components/studio/PdfPagePreview";
import { Button } from "@/components/ui/button";

/**
 * Internal trip print studio: an order's `_design` (v2, a trip) → the
 * print-ready PDF for the fulfilment partner, one page per print, with bleed.
 * Not linked from the site and excluded from search.
 */
export const Route = createFileRoute("/studio/trip")({
  head: () => ({
    meta: [
      { title: "Trip print studio | TripMyWay" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TripStudio,
});

const BLEEDS = [
  { value: 0, label: "None" },
  { value: 0.125, label: "⅛″ (standard)" },
  { value: 0.25, label: "¼″" },
];

function TripStudio() {
  const items = useCart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [pasted, setPasted] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [bleedIn, setBleedIn] = useState(0.125);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    url: string;
    bytes: Uint8Array;
    pages: number;
    fileName: string;
    widthIn: number;
    heightIn: number;
  } | null>(null);

  const cartTrips = items.filter((i) => i.trip);
  const design: TripDesign | string | null = useMemo(() => {
    if (pasted.trim()) return parseTripDesign(pasted);
    return cartTrips[0]?.trip ?? null;
  }, [pasted, cartTrips]);
  const valid = design && typeof design !== "string" ? design : null;

  async function generate() {
    if (!valid) return;
    setError(null);
    setResult(null);
    try {
      const res = await generateTripPrintFile(valid, {
        bleedIn,
        onProgress: setProgress,
        ...(orderRef.trim() ? { orderRef: orderRef.trim() } : {}),
      });
      const url = URL.createObjectURL(
        new Blob([res.bytes as BlobPart], { type: "application/pdf" }),
      );
      setResult({
        url,
        bytes: res.bytes,
        pages: res.pages,
        fileName: res.fileName,
        widthIn: res.widthIn,
        heightIn: res.heightIn,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  if (!mounted) return <div className="min-h-[60vh]" />;
  const props = valid ? tripLineItemProperties(valid, tripPrintCount(valid)) : null;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-12 md:px-10">
      <p className="eyebrow">Internal</p>
      <h1 className="mt-2 text-5xl">Trip print studio</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Paste the <code>_design</code> from a trip order to make its print file. Single-place orders
        go through the{" "}
        <Link to="/studio/print" className="underline underline-offset-4">
          print studio
        </Link>
        .
      </p>
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="eyebrow">Order design</span>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={8}
              placeholder={
                cartTrips.length
                  ? "Leave empty to use the first trip in this browser's cart"
                  : '{"v":2,"trip":{…}}'
              }
              className="mt-2 w-full rounded-xl border-2 border-border bg-card p-3 font-mono text-xs"
            />
          </label>
          {typeof design === "string" && <p className="text-sm text-destructive">{design}</p>}
          {props && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {Object.entries(props)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
          )}
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Order number
              <input
                value={orderRef}
                onChange={(e) => setOrderRef(e.target.value)}
                className="h-10 rounded-lg border-2 border-border bg-card px-3"
                placeholder="e.g. 1001"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Bleed
              <select
                value={bleedIn}
                onChange={(e) => setBleedIn(Number(e.target.value))}
                className="h-10 rounded-lg border-2 border-border bg-card px-2"
              >
                {BLEEDS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="editorial"
              size="lg"
              disabled={!valid || Boolean(progress)}
              onClick={() => void generate()}
            >
              {progress ? `${progress}…` : "Make print file"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {valid && (
            <p className="text-xs text-muted-foreground">
              Photos are fetched from storage, which deletes them 180 days after upload. Make the
              file well within that.
            </p>
          )}
        </div>
        <div>
          {result && (
            <div className="flex flex-col gap-4">
              <Button asChild variant="editorial-outline" size="lg">
                <a href={result.url} download={result.fileName}>
                  Download {result.fileName}
                </a>
              </Button>
              <p className="text-sm text-muted-foreground">
                {result.pages} page{result.pages > 1 ? "s" : ""},{" "}
                {getPrintSize(valid!.printSize).label} in each
                {bleedIn ? ` plus ${bleedIn}″ bleed` : ""}.
              </p>
              {Array.from({ length: result.pages }, (_, i) => (
                <PdfPagePreview
                  key={i}
                  bytes={result.bytes}
                  page={i + 1}
                  width={400}
                  height={Math.round(
                    (400 * (result.heightIn + 2 * bleedIn)) / (result.widthIn + 2 * bleedIn),
                  )}
                  className="w-full shadow-print"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
