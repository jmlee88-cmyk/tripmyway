import { useEffect, useRef, useState } from "react";

/**
 * Renders one page (page 1 unless `page` says otherwise) of a PDF onto a canvas at exactly `width`×`height` CSS px
 * (at device resolution). Unlike the browser's PDF viewer in an iframe there is
 * no viewer chrome, zoom or scrollbars — the page is shown whole, 1:1 with the
 * print sheet preview beside it. pdf.js is loaded only when this mounts.
 */
export function PdfPagePreview({
  bytes,
  width,
  height,
  className,
  page: pageNumber = 1,
}: {
  bytes: Uint8Array;
  width: number;
  height: number;
  className?: string;
  /** 1-based page number. */
  page?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    (async () => {
      try {
        const [pdfjs, worker] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        // pdf.js may detach the buffer it is given; pass a copy.
        const task = pdfjs.getDocument({ data: bytes.slice() });
        destroy = () => void task.destroy();
        const doc = await task.promise;
        const page = await doc.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const base = page.getViewport({ scale: 1 });
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: (width / base.width) * dpr });
        const canvas = canvasRef.current;
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [bytes, width, pageNumber]);

  if (error) {
    return (
      <div
        className="flex items-center justify-center p-4 text-center text-xs text-destructive"
        style={{ width, maxWidth: "100%", aspectRatio: `${width} / ${height}` }}
      >
        Couldn't display the PDF: {error}
      </div>
    );
  }
  return (
    <canvas
      ref={canvasRef}
      // Shown at `width` px, but never wider than its box; the height follows the
      // page's proportions so a narrower box never squashes the print.
      style={{ width, maxWidth: "100%", height: "auto", aspectRatio: `${width} / ${height}` }}
      className={className}
      aria-label="Generated print PDF, page 1"
      role="img"
    />
  );
}
