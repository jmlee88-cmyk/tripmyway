import { useEffect, useRef, useState } from "react";
import type { PrintSizeId } from "@/types/product";
import type { PhotoCrop, TripPhoto } from "@/types/trip";
import { PhotoError, tooSmallMessage, uploadTripPhoto } from "@/lib/photos";
import { clampCrop, cropSquare, maxZoomFor, photoTooSmall } from "@/lib/trip/photos";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** A photo drawn as it will print: the chosen square, in a circle `size` px across. */
export function PhotoCircle({
  photo,
  size,
  className = "",
}: {
  photo: TripPhoto;
  size: number;
  className?: string;
}) {
  const sq = cropSquare(photo);
  const k = size / sq.side;
  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-full bg-muted ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={photo.url}
        alt=""
        draggable={false}
        className="absolute max-w-none select-none"
        style={{
          width: photo.widthPx * k,
          height: photo.heightPx * k,
          left: size / 2 - sq.cx * k,
          top: size / 2 - sq.cy * k,
        }}
      />
    </span>
  );
}

/**
 * Add, crop, replace or remove the photo for one stop. Photos too small for
 * the print size are refused; zoom is limited so the circle stays sharp.
 */
export function TripPhotoField({
  photo,
  sizeId,
  stopName,
  onChange,
}: {
  photo?: TripPhoto | undefined;
  sizeId: PrintSizeId;
  stopName: string;
  onChange: (photo: TripPhoto | undefined) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const p = await uploadTripPhoto(file, sizeId);
      onChange(p);
      track("journey_photo_added");
      setCropping(true);
    } catch (e) {
      setError(
        e instanceof PhotoError ? e.message : "We couldn't upload this photo. Please try again.",
      );
      track("journey_photo_refused");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const small = photo && photoTooSmall(photo, sizeId);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {photo && (
          <button
            type="button"
            onClick={() => setCropping(true)}
            aria-label={`Choose what shows in the circle for ${stopName}`}
            className="rounded-full ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
          >
            <PhotoCircle photo={photo} size={44} />
          </button>
        )}
        <label
          className={`underline underline-offset-4 ${busy ? "cursor-wait opacity-60" : "cursor-pointer"}`}
        >
          {busy ? "Preparing photo…" : photo ? "Change photo" : "Add a photo"}
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
            className="sr-only"
            disabled={busy}
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </label>
        {photo && (
          <>
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => setCropping(true)}
            >
              Adjust
            </button>
            <button
              type="button"
              className="text-muted-foreground underline underline-offset-4"
              onClick={() => onChange(undefined)}
            >
              Remove
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {small && !error && (
        <p role="alert" className="text-xs text-destructive">
          {tooSmallMessage(photo, sizeId)}
        </p>
      )}
      {photo && cropping && (
        <CropDialog
          photo={photo}
          sizeId={sizeId}
          stopName={stopName}
          onClose={() => setCropping(false)}
          onSave={(crop) => {
            onChange({ ...photo, crop });
            setCropping(false);
            track("journey_photo_cropped");
          }}
        />
      )}
    </div>
  );
}

const STAGE = 280;

function CropDialog({
  photo,
  sizeId,
  stopName,
  onClose,
  onSave,
}: {
  photo: TripPhoto;
  sizeId: PrintSizeId;
  stopName: string;
  onClose: () => void;
  onSave: (crop: PhotoCrop) => void;
}) {
  const top = maxZoomFor(photo, sizeId);
  const [crop, setCrop] = useState(() => clampCrop(photo, photo.crop, sizeId));
  const drag = useRef<{ x: number; y: number; crop: PhotoCrop } | null>(null);
  useEffect(() => setCrop(clampCrop(photo, photo.crop, sizeId)), [photo, sizeId]);

  const shown = { ...photo, crop };
  const side = Math.min(photo.widthPx, photo.heightPx) / crop.zoom;
  const k = STAGE / side; // stage pixels per photo pixel
  const move = (dx: number, dy: number, from: PhotoCrop) =>
    setCrop(
      clampCrop(
        photo,
        { ...from, x: from.x - dx / k / photo.widthPx, y: from.y - dy / k / photo.heightPx },
        sizeId,
      ),
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Photo for {stopName}</DialogTitle>
          <DialogDescription>
            Drag to choose what shows in the circle; zoom to get closer.
          </DialogDescription>
        </DialogHeader>
        <div
          className="relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-full bg-muted active:cursor-grabbing"
          style={{ width: STAGE, height: STAGE }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, crop };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d) move(e.clientX - d.x, e.clientY - d.y, d.crop);
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={(e) => {
            const step = 10;
            const keys: Record<string, [number, number]> = {
              ArrowLeft: [step, 0],
              ArrowRight: [-step, 0],
              ArrowUp: [0, step],
              ArrowDown: [0, -step],
            };
            const d = keys[e.key];
            if (d) {
              e.preventDefault();
              move(d[0], d[1], crop);
            }
          }}
          tabIndex={0}
          role="application"
          aria-label="Photo position. Use the arrow keys to move it."
        >
          <PhotoCircle photo={shown} size={STAGE} className="pointer-events-none" />
        </div>
        <label className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span>Zoom</span>
          <Slider
            min={1}
            max={top}
            step={0.01}
            value={[crop.zoom]}
            disabled={top <= 1}
            onValueChange={([z]) => setCrop(clampCrop(photo, { ...crop, zoom: z ?? 1 }, sizeId))}
            aria-label="Zoom"
          />
        </label>
        {top < 1.05 && (
          <p className="text-xs text-muted-foreground">
            This photo can't be zoomed further and still print sharply at this size.
          </p>
        )}
        <DialogFooter>
          <Button variant="editorial-outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="editorial" size="sm" onClick={() => onSave(crop)}>
            Use this
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
