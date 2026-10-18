import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Customization, PrintFormat } from "@/types/product";
import { MAP_STYLES, getMapStyle } from "@/config/map-styles";
import {
  DEFAULT_CUSTOMIZATION, LAYOUTS, MARKERS, PRINT_FINISHES, PRINT_FORMATS, PRINT_SIZES, SUBTITLE_MAX, TITLE_MAX, ZOOM_LEVELS,
  FRAME_COLOR_LABELS, FRAME_STYLES, defaultSubtitle, formatCoordinates, formatPrice, frameLabel, framePrice, getFinish, getFrame, getPrintFormat, getPrintSize,
} from "@/config/products";
import { LocationSearch } from "@/components/editor/LocationSearch";
import { FramedPoster, framedSizeIn } from "@/components/poster/FramedPoster";
import { DemoMapArt } from "@/components/map/DemoMapArt";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { addToCart, validatePanels } from "@/lib/cart";
import { applyPanelPatch, ensurePanels, withSharedFields } from "@/lib/print-set";
import { takeStoryDraft } from "@/lib/story";
import { track } from "@/lib/analytics";
import roomWall from "@/assets/room-wall.jpg";

export const Route = createFileRoute("/create")({
  validateSearch: (s: Record<string, unknown>): { style?: string; from?: "story" } => ({
    ...(typeof s["style"] === "string" ? { style: s["style"] } : {}),
    ...(s["from"] === "story" ? { from: "story" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Create Your Map | TripMyWay" },
      { name: "description", content: "Design a personalized map print: choose a place, a style and your words, then preview it live." },
      { property: "og:title", content: "Create Your Map | TripMyWay" },
      { property: "og:description", content: "Choose a place, a style and your words — and see your map artwork come to life." },
    ],
  }),
  component: CreatePage,
});

function CreatePage() {
  const { style, from } = Route.useSearch();
  const navigate = useNavigate();
  // Every design is a list of panels: one for a single print, three for a set.
  // Panels beyond the current format are kept, so switching never loses work.
  const [panels, setPanels] = useState<Customization[]>(() => [{
    ...DEFAULT_CUSTOMIZATION,
    styleId: style && MAP_STYLES.some((s) => s.id === style) ? style : DEFAULT_CUSTOMIZATION.styleId,
  }]);
  const [format, setFormat] = useState<PrintFormat>("single");
  const [active, setActive] = useState(0);
  const count = getPrintFormat(format).panels;
  const shown = panels.slice(0, count);
  const isSet = count > 1;
  const c = shown[Math.min(active, count - 1)]!;
  const [view, setView] = useState<"artwork" | "room">("artwork");
  // Phones: the preview stays pinned under the header while the settings
  // scroll beneath it. Its height can be changed; typing shrinks it so the
  // keyboard and the field both fit.
  const [dock, setDock] = useState<Dock>("normal");
  const [typing, setTyping] = useState(false);
  const dockNow: Dock = typing ? "mini" : dock;
  // The site header is taller on phones (its menu wraps to a second row); pin just below it.
  const [headerH, setHeaderH] = useState(64);
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const measure = () => setHeaderH(header.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
  const [large, setLarge] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // Phones and tablets: one step at a time (desktop shows every step at once).
  const [stepIdx, setStepIdx] = useState(0);
  const step = WIZARD[stepIdx]!;
  const last = stepIdx === WIZARD.length - 1;
  const [stepError, setStepError] = useState("");
  const wz = (key: WizardKey) => (step.key === key ? "" : "hidden lg:block");
  const started = useRef(false);

  const update = (patch: Partial<Customization>) => {
    if (!started.current) { started.current = true; track("customization_started"); }
    setPanels((p) => applyPanelPatch(p, Math.min(active, count - 1), patch));
  };

  const chooseFormat = (f: PrintFormat) => {
    track("format_selected", { format: f });
    setFormat(f);
    setPanels((p) => ensurePanels(p, getPrintFormat(f).panels));
    setActive(0);
  };

  const selectPanel = (i: number) => {
    if (i === active) return;
    track("panel_selected", { panel: i + 1 });
    setActive(i);
  };

  // Arriving from "Tell us your story": start from the suggested panels.
  const [fromStory, setFromStory] = useState(false);
  useEffect(() => {
    if (from !== "story") return;
    const draft = takeStoryDraft();
    if (!draft) return;
    const count = getPrintFormat(draft.format).panels;
    setFormat(draft.format);
    setPanels(ensurePanels(draft.panels.map((p) => withSharedFields(p, panels[0]!)), count));
    setActive(0);
    setFromStory(true);
  }, [from]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (errors.length) setErrors(validatePanels(shown)); }, [panels, format]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setStepError(""), [panels]);

  const size = getPrintSize(c.printSize);
  const styleObj = getMapStyle(c.styleId);
  const finish = getFinish(c.finish);
  const frame = getFrame(c);
  const frameStyle = FRAME_STYLES[finish.id];
  const price = formatPrice(size.id, count, finish.id, frame);
  // Proportions of the finished piece, frame included.
  const outer = framedSizeIn(c);
  const aspect = outer.widthIn / outer.heightIn;
  const sizeLabel = isSet ? `Set of ${count} · ${size.label}` : size.label;

  const onAdd = () => {
    const errs = validatePanels(shown);
    setErrors(errs);
    if (errs.length) return;
    const item = addToCart(isSet ? shown : c);
    // Start drawing the order preview now, so it's ready by checkout.
    void import("@/lib/preview").then((m) => m.ensurePreview(item));
    toast("Added to cart", {
      description: isSet
        ? `Set of ${count}: ${shown.map((p) => p.title).join(" · ")} — ${size.label} ${finish.short.toLowerCase()}, ${styleObj.name}`
        : `${c.title} — ${size.label} ${finish.short.toLowerCase()}${frame !== "none" ? `, ${frameLabel(c).toLowerCase()}` : ""}, ${styleObj.name}`,
      action: { label: "View cart", onClick: () => navigate({ to: "/cart" }) },
    });
  };

  const goTo = (i: number) => {
    setStepError("");
    setStepIdx(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const next = () => {
    // Only move on once this step has what the print needs.
    if (step.key === "place" && shown.some((p) => !p.location)) {
      return setStepError(isSet ? "Choose a place for every panel." : "Choose a place for your map.");
    }
    if (step.key === "words") {
      const missing = shown.findIndex((p) => !p.title.trim());
      if (missing >= 0) {
        if (isSet) setActive(missing);
        return setStepError(isSet ? `Add a title for panel ${missing + 1}.` : "Add a title for your print.");
      }
    }
    track("wizard_step", { from: step.key, to: WIZARD[stepIdx + 1]?.key ?? "add" });
    if (last) return onAdd();
    goTo(stepIdx + 1);
  };

  return (
    <div className={`mx-auto max-w-7xl px-5 pb-36 md:px-10 lg:pb-16 lg:pt-12 ${stepIdx > 0 ? "pt-2" : "pt-8"}`}>
      <div className={`mb-8 md:mb-12 ${stepIdx > 0 ? "hidden lg:block" : ""}`}>
        <p className="eyebrow">Create your map</p>
        <h1 className="mt-2 text-4xl md:text-5xl">Make it yours.</h1>
        {fromStory ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Started from your story. Choose a style and size — and change anything you like.
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Mapping a whole trip?{" "}
            <Link to="/journey" className="text-foreground underline underline-offset-4">Map your journey</Link>{" "}
            from your itinerary.
          </p>
        )}
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        {/* PREVIEW — first on mobile, right column on desktop */}
        <section
          aria-label="Live preview"
          className="sticky z-30 -mx-5 self-start border-b border-border bg-background px-5 pt-2 md:-mx-10 md:px-10 lg:static lg:order-2 lg:mx-0 lg:border-0 lg:px-0 lg:pt-0 lg:[--pv:auto] lg:[--pvi:68vh] lg:[--pvs:60vh]"
          style={{ top: headerH, "--pv": DOCK_HEIGHT[dockNow], "--pvi": `calc(${DOCK_HEIGHT[dockNow]} - 1.5rem)`, "--pvs": `calc(${DOCK_HEIGHT[dockNow]} - 2.5rem)` } as React.CSSProperties}
        >
          <div className="lg:sticky lg:top-24">
            <div className="flex items-center justify-between pb-2 lg:pb-4">
              <div role="tablist" aria-label="Preview mode" className="flex gap-4 sm:gap-5">
                {(["artwork", "room"] as const).map((v) => (
                  <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                    className="whitespace-nowrap border-b pb-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors aria-selected:border-foreground aria-selected:text-foreground border-transparent sm:text-xs sm:tracking-[0.2em]">
                    {v === "artwork" ? "Artwork" : <>Room<span className="hidden sm:inline"> Preview</span></>}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setLarge(true)} className="whitespace-nowrap px-1 text-[11px] uppercase tracking-[0.14em] underline-offset-4 hover:underline sm:text-xs sm:tracking-[0.2em]">View larger</button>
                {/* Phones only: resize the pinned preview */}
                <button type="button" onClick={() => setDock(DOCK_SMALLER[dock])} disabled={dock === "mini"} aria-label="Make preview smaller"
                  className="grid h-9 w-9 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30 lg:hidden"><ChevronUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => setDock(DOCK_LARGER[dock])} disabled={dock === "large"} aria-label="Make preview larger"
                  className="grid h-9 w-9 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30 lg:hidden"><ChevronDown className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="overflow-hidden bg-stage lg:overflow-visible">
              {view === "artwork" ? (
                <div className="flex h-[var(--pv)] items-center justify-center p-3 transition-[height] duration-300 sm:p-6 lg:min-h-[min(78vh,760px)] lg:p-12">
                  {isSet ? (
                    <SetPreview panels={shown} active={active} onSelect={selectPanel} maxHeight="var(--pvs)" aspect={aspect} />
                  ) : (
                    <div style={{ width: `min(100%, calc(var(--pvi) * ${aspect}))` }}>
                      <FramedPoster customization={c} trackPreview className="w-full shadow-print-lg" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative mx-auto h-[var(--pv)] overflow-hidden fade-in transition-[height] duration-300 lg:h-auto lg:w-full" style={{ aspectRatio: "1 / 1" }}>
                  <img src={roomWall} alt="Minimal room interior" width={1200} height={1200} className="absolute inset-0 h-full w-full object-cover" />
                  <RoomWall panels={isSet ? shown : [c]} widthIn={outer.widthIn} heightIn={outer.heightIn} />
                </div>
              )}
            </div>
            <p className="mt-3 hidden text-xs text-muted-foreground lg:block">
              {isSet ? `Set of ${count} · ${size.label} in each` : `${size.label} in`} · {finish.label}{frame !== "none" ? ` · ${frameLabel(c)}` : ""} · {styleObj.name} · Screen preview — final artwork is prepared separately at print resolution.
            </p>
          </div>
        </section>

        {/* CONTROLS */}
        <div
          className="lg:order-1"
          onFocusCapture={(e) => { if (isTextField(e.target) && !isDesktop()) setTyping(true); }}
          onBlurCapture={(e) => { if (isTextField(e.target)) setTyping(false); }}
        >
          <section aria-label="Format" className={`border-border py-5 lg:border-b lg:pb-8 lg:pt-0 ${wz("format")}`}>
            <p className="eyebrow mb-3">One print or a set?</p>
            <Segmented label="Format" value={format} onChange={chooseFormat} options={PRINT_FORMATS} wide />
            <p className="mt-2 text-xs text-muted-foreground">{getPrintFormat(format).description}</p>
          </section>

          {isSet && (
            <div className={step.perPanel ? "" : "hidden lg:block"}>
              <PanelTabs count={count} active={active} titles={shown.map((p) => p.title)} onSelect={selectPanel} />
            </div>
          )}

          <Step className={wz("place")} n="01" title="Choose your place" scope={isSet ? `Panel ${active + 1}` : undefined}>
            <LocationSearch
              value={c.location}
              onSelect={(l) => {
                track("location_selected", { place: l.formattedAddress });
                update({ location: l, subtitle: defaultSubtitle(l), coordinates: formatCoordinates(l.latitude, l.longitude) });
              }}
            />
          </Step>

          <Step className={wz("style")} n="02" title="Select a style" scope={isSet ? "All panels" : undefined}>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5" role="radiogroup" aria-label="Map style">
              {MAP_STYLES.map((s, i) => (
                <button key={s.id} role="radio" aria-checked={c.styleId === s.id}
                  onClick={() => { track("style_selected", { style: s.id }); update({ styleId: s.id }); }}
                  className="group text-left">
                  <div className={`aspect-[4/5] overflow-hidden border transition-all ${c.styleId === s.id ? "border-foreground ring-1 ring-foreground" : "border-border group-hover:border-foreground/50"}`}>
                    <DemoMapArt config={s.configuration} seed={i + 3} className="h-full w-full" />
                  </div>
                  <span className="mt-2 block text-xs leading-tight">{s.name}</span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{styleObj.description}</p>
          </Step>

          <Step className={wz("words")} n="03" title="Personalize" scope={isSet ? `Panel ${active + 1}` : undefined}>
            <div className="space-y-6">
              <Field label="Title" count={`${c.title.length}/${TITLE_MAX}`}>
                {(id) => <TextInput id={id} value={c.title} maxLength={TITLE_MAX} onChange={(v) => update({ title: v })} invalid={!c.title.trim() && errors.length > 0} />}
              </Field>
              <Field label="Subtitle" count={`${c.subtitle.length}/${SUBTITLE_MAX}`}>
                {(id) => <TextInput id={id} value={c.subtitle} maxLength={SUBTITLE_MAX} onChange={(v) => update({ subtitle: v })} />}
              </Field>
              <Field label="Date (optional)">
                {(id) => <TextInput id={id} value={c.date} maxLength={30} placeholder="e.g. 2018" onChange={(v) => update({ date: v })} />}
              </Field>
              <Field label="Location line">
                {(id) => <TextInput id={id} value={c.coordinates} maxLength={50} disabled={!c.showCoordinates} onChange={(v) => update({ coordinates: v })} />}
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <label className="flex items-center gap-3 text-sm">
                  <Switch checked={c.showCoordinates} onCheckedChange={(v) => update({ showCoordinates: v })} />
                  Show location line
                </label>
                <Segmented label="Lettering" value={c.textCase} onChange={(v) => update({ textCase: v })}
                  options={[{ id: "upper", label: "UPPERCASE" }, { id: "title", label: "As typed" }]} />
              </div>
            </div>
          </Step>

          <Step className={wz("layout")} n="04" title="Layout & map area">
            <div className="space-y-5">
              <div>
                <p className="eyebrow mb-2">Layout{isSet && <span className="normal-case tracking-normal text-muted-foreground"> · all panels</span>}</p>
                <Segmented label="Layout" value={c.layout ?? "framed"} onChange={(v) => update({ layout: v })} options={LAYOUTS} wide />
                <p className="mt-2 text-xs text-muted-foreground">
                  {c.layout === "fullBleed"
                    ? "The map runs to the top and side edges, with your words in a band below. Ideal for metal and acrylic."
                    : "The map sits inside a paper margin, like a classic art print."}
                </p>
              </div>
              <div>
                <p className="eyebrow mb-2">Map area{isSet && <span className="normal-case tracking-normal text-muted-foreground"> · panel {active + 1}</span>}</p>
                <Segmented label="Map area" value={c.zoomLevel} onChange={(v) => update({ zoomLevel: v })} options={ZOOM_LEVELS} wide />
              </div>
            </div>
          </Step>

          <Step className={wz("marker")} n="05" title="Marker" scope={isSet ? "All panels" : undefined}>
            <Segmented label="Marker" value={c.markerStyle} onChange={(v) => update({ markerStyle: v })} options={MARKERS} wide />
          </Step>

          <Step className={wz("finish")} n="06" title="Finish" scope={isSet ? "All panels" : undefined}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Print finish">
              {PRINT_FINISHES.map((f) => (
                <button key={f.id} role="radio" aria-checked={finish.id === f.id}
                  onClick={() => { track("finish_selected", { finish: f.id }); update({ finish: f.id }); }}
                  className={`border px-3 py-4 text-left transition-colors ${finish.id === f.id ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/50"}`}>
                  <span className="block font-display text-xl">{f.short}</span>
                  <span className="block text-xs opacity-70">from ${formatPrice(PRINT_SIZES[0]!.id, count, f.id)}{isSet ? " set" : ""}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{finish.description}</p>
          </Step>

          <Step className={wz("frame")} n="07" title="Frame" scope={isSet ? "All panels" : "Optional"}>
            <p className="mb-3 text-sm text-muted-foreground">{frameStyle.label} · {frameStyle.description}</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Frame">
              {(["none", ...frameStyle.colors] as const).map((f) => (
                <button key={f} role="radio" aria-checked={frame === f}
                  onClick={() => { track("frame_selected", { frame: f, finish: finish.id }); update({ frame: f }); }}
                  className={`flex min-h-11 items-center gap-2 border px-3 py-2 text-xs transition-colors ${frame === f ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/50"}`}>
                  {f !== "none" && <span aria-hidden className="h-4 w-4 shrink-0 border border-black/20" style={{ background: SWATCH[f] }} />}
                  {FRAME_COLOR_LABELS[f]}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {frame === "none"
                ? `Add a ${frameStyle.label.toLowerCase()} for +$${framePrice(size.id, finish.id) * count}${isSet ? " (all three)" : ""} at ${size.label} in.`
                : `${frameLabel(c)}: +$${framePrice(size.id, finish.id) * count}${isSet ? " for all three" : ""} at ${size.label} in. Arrives ready to hang.`}
            </p>
          </Step>

          <Step className={wz("size")} n="08" title="Print size" scope={isSet ? "Each panel" : undefined} last>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5" role="radiogroup" aria-label="Print size">
              {PRINT_SIZES.map((s) => (
                <button key={s.id} role="radio" aria-checked={c.printSize === s.id}
                  onClick={() => { track("size_selected", { size: s.id }); update({ printSize: s.id }); }}
                  className={`border px-2 py-4 text-left transition-colors ${c.printSize === s.id ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/50"}`}>
                  <span className="block font-display text-lg leading-tight">{s.label}</span>
                  <span className="block text-[11px] opacity-70">inches</span>
                  <span className="mt-1 block text-xs">${formatPrice(s.id, count, finish.id, frame)}{isSet ? " set" : ""}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{frame !== "none" ? `Prices include the ${frameLabel(c).toLowerCase()}.` : finish.id === "paper" ? "Print only — add a frame above." : "Arrives ready to hang."}</p>
          </Step>

          {/* Desktop purchase block */}
          <div className="mt-10 hidden border-t border-foreground pt-8 lg:block">
            <PurchaseRow size={sizeLabel} finish={frame !== "none" ? `${finish.short} · ${FRAME_COLOR_LABELS[frame]} ${frameStyle.id} frame` : finish.label} price={price} onAdd={onAdd} />
            <Errors errors={errors} />
          </div>
        </div>
      </div>

      {/* Phones and tablets: step-by-step bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
        <div className="mb-2 flex gap-1" aria-hidden>
          {WIZARD.map((s, i) => (
            <span key={s.key} className={`h-0.5 flex-1 ${i <= stepIdx ? "bg-foreground" : "bg-border"}`} />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="editorial-outline" size="lg" onClick={() => goTo(stepIdx - 1)} disabled={stepIdx === 0} className="px-4">Back</Button>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{step.label} · {stepIdx + 1}/{WIZARD.length}</div>
            <div className="font-display text-xl leading-tight">${price}</div>
          </div>
          <Button variant="editorial" size="lg" onClick={next} className="px-5">{last ? "Add to cart" : "Next"}</Button>
        </div>
        {stepError && <p className="mt-2 text-xs text-destructive" role="alert">{stepError}</p>}
        <Errors errors={errors} />
      </div>

      <Dialog open={large} onOpenChange={setLarge}>
        <DialogContent className={`${isSet ? "max-w-[min(96vw,1500px)]" : "max-w-[min(92vw,900px)]"} border-none bg-stage p-6 sm:p-10`}>
          <DialogTitle className="sr-only">Larger preview</DialogTitle>
          {large && isSet ? (
            <SetPreview panels={shown} active={active} onSelect={selectPanel} maxHeight="76vh" aspect={aspect} />
          ) : (
            <div className="mx-auto" style={{ width: `min(100%, calc(82vh * ${aspect}))` }}>
              {large && <FramedPoster customization={c} className="w-full shadow-print-lg" />}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <p className="sr-only" aria-live="polite">{errors.join(" ")}</p>
    </div>
  );
}

/**
 * ROOM PREVIEW at true scale. Measured from room-wall.jpg (1200 px square):
 * the bench runs from x 165 to 1044 px and is 72 in long, so 1 in = 1.017% of
 * the picture; its seat top is 69.6% down. Prints hang 10 in above the seat,
 * centred on the bench. Big pieces run past the edges, as on a real wall.
 */
const ROOM = {
  pctPerInch: (1044 - 165) / 72 / 12,
  benchLeft: 165 / 12,
  benchRight: 1044 / 12,
  benchIn: 72,
  seatTop: 69.6,
  hangAboveSeatIn: 10,
  setGapIn: 2,
};

function feetAndInches(exact: number) {
  const inches = Math.round(exact);
  const ft = Math.floor(inches / 12);
  const rest = inches - ft * 12;
  return `${inches} in (${ft ? `${ft} ft` : ""}${ft && rest ? " " : ""}${rest ? `${rest} in` : ""})`;
}

function RoomWall({ panels, widthIn, heightIn }: { panels: Customization[]; widthIn: number; heightIn: number }) {
  const n = panels.length;
  const totalIn = n * widthIn + (n - 1) * ROOM.setGapIn;
  const width = totalIn * ROOM.pctPerInch;
  const bottom = ROOM.seatTop - ROOM.hangAboveSeatIn * ROOM.pctPerInch;
  const top = bottom - heightIn * ROOM.pctPerInch;
  const centre = (ROOM.benchLeft + ROOM.benchRight) / 2;
  const overflows = width > 100;
  return (
    <>
      <div className="absolute flex -translate-x-1/2 items-start" style={{ left: `${centre}%`, top: `${top}%`, width: `${width}%`, gap: `${(ROOM.setGapIn / totalIn) * 100}%` }}>
        {panels.map((p, i) => (
          <div key={i} className="min-w-0 flex-1">
            <FramedPoster customization={p} className="w-full shadow-print-lg" />
          </div>
        ))}
      </div>
      <Dimension left={centre - width / 2} width={width} top={Math.max(3, top - 3.2)} label={`${n > 1 ? "Set" : "Print"} · ${feetAndInches(totalIn)}`} />
      <Dimension left={ROOM.benchLeft} width={ROOM.benchRight - ROOM.benchLeft} top={88.5} label={`Bench · ${feetAndInches(ROOM.benchIn)}`} />
      {overflows && (
        <p className="absolute inset-x-0 bottom-0 bg-background/85 px-4 py-2 text-center text-[11px] tracking-wide text-muted-foreground backdrop-blur-sm">
          Shown to scale — wider than this view.
        </p>
      )}
    </>
  );
}

/** A thin measuring line with end ticks and a label, in % of the room picture. */
function Dimension({ left, width, top, label }: { left: number; width: number; top: number; label: string }) {
  const halo = { boxShadow: "0 0 0 1px rgba(255,255,255,0.45)" };
  const tick = "absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-foreground/85";
  return (
    <div aria-hidden className="pointer-events-none absolute" style={{ left: `${left}%`, width: `${width}%`, top: `${top}%` }}>
      <div className="relative h-px w-full bg-foreground/80" style={halo}>
        <span className={`${tick} left-0`} style={halo} />
        <span className={`${tick} right-0`} style={halo} />
      </div>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-[#f4efe8]/95 px-2 py-0.5 text-[10px] tracking-wide text-foreground/80">
        {label}
      </span>
    </div>
  );
}

/** Three panels side by side, sized to fit `maxHeight`; click one to edit it. */
function SetPreview({ panels, active, onSelect, maxHeight, aspect }: { panels: Customization[]; active: number; onSelect: (i: number) => void; maxHeight: string; aspect: number }) {
  const n = panels.length;
  return (
    <div className="mx-auto grid w-full items-start gap-3 sm:gap-5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, maxWidth: `calc(${n} * ${maxHeight} * ${aspect} + ${n - 1} * 1.25rem)` }}>
      {panels.map((p, i) => (
        <button key={i} type="button" onClick={() => onSelect(i)} aria-pressed={i === active} aria-label={`Edit panel ${i + 1}: ${p.title}`} className="group text-left">
          <FramedPoster customization={p} trackPreview={i === 0} className="w-full shadow-print-lg" />
          <span className={`mt-3 block border-t pt-2 text-center text-[10px] uppercase tracking-[0.25em] transition-colors ${i === active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground group-hover:text-foreground"}`}>
            {ROMAN[i] ?? i + 1}
          </span>
        </button>
      ))}
    </div>
  );
}

const ROMAN = ["I", "II", "III", "IV", "V"];

/** Heights of the pinned preview on phones. */
type Dock = "mini" | "normal" | "large";
const DOCK_HEIGHT: Record<Dock, string> = { mini: "17svh", normal: "38svh", large: "56svh" };

/** Steps of the phone/tablet flow, in order. perPanel: edited separately for each panel of a set. */
type WizardKey = "format" | "place" | "style" | "words" | "layout" | "marker" | "finish" | "frame" | "size";
const WIZARD: { key: WizardKey; label: string; perPanel?: boolean }[] = [
  { key: "format", label: "Print or set" },
  { key: "place", label: "Place", perPanel: true },
  { key: "style", label: "Style" },
  { key: "words", label: "Personalize", perPanel: true },
  { key: "layout", label: "Layout", perPanel: true },
  { key: "marker", label: "Marker" },
  { key: "finish", label: "Finish" },
  { key: "frame", label: "Frame" },
  { key: "size", label: "Size" },
];
const DOCK_SMALLER: Record<Dock, Dock> = { mini: "mini", normal: "mini", large: "normal" };
const DOCK_LARGER: Record<Dock, Dock> = { mini: "normal", normal: "large", large: "large" };

const isTextField = (el: EventTarget) =>
  el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && (el as HTMLInputElement).type !== "checkbox";
const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

const SWATCH: Record<string, string> = {
  white: "#f4f2ee",
  black: "#1d1b19",
  natural: "linear-gradient(135deg, #e2cba5, #c9a877)",
  gold: "linear-gradient(135deg, #a8843f, #e8d293, #b8954f)",
  silver: "linear-gradient(135deg, #8e9195, #e9ebee, #a5a8ac)",
};

/** Which panel the per-panel steps are editing. Sticks below the header while scrolling. */
function PanelTabs({ count, active, titles, onSelect }: { count: number; active: number; titles: string[]; onSelect: (i: number) => void }) {
  return (
    <div className="-mx-1 border-b border-border bg-background/95 px-1 py-3 backdrop-blur lg:sticky lg:top-16 lg:z-30">
      <div role="tablist" aria-label="Panel being edited" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
        {Array.from({ length: count }, (_, i) => (
          <button key={i} role="tab" aria-selected={i === active} onClick={() => onSelect(i)}
            className={`min-h-11 border px-3 py-2 text-left transition-colors ${i === active ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/50"}`}>
            <span className="block text-[10px] uppercase tracking-[0.2em] opacity-70">Panel {ROMAN[i] ?? i + 1}</span>
            <span className="block truncate text-xs">{titles[i] || "Untitled"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Step({ n, title, children, last, scope, className = "" }: { n: string; title: string; children: ReactNode; last?: boolean; scope?: string | undefined; className?: string }) {
  return (
    <section className={`py-5 lg:py-8 ${last ? "" : "lg:border-b lg:border-border"} ${className}`} aria-labelledby={`step-${n}`}>
      <div className="mb-4 flex items-baseline gap-4 lg:mb-5">
        <span className="hidden font-display text-sm italic text-ochre lg:inline">{n}</span>
        <h2 id={`step-${n}`} className="text-2xl md:text-3xl">{title}</h2>
        {scope && <span className="ml-auto text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{scope}</span>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, count, children }: { label: string; count?: string; children: (id: string) => ReactNode }) {
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <div className="flex justify-between">
        <label htmlFor={id} className="eyebrow">{label}</label>
        {count && <span className="text-[11px] text-muted-foreground">{count}</span>}
      </div>
      {children(id)}
    </div>
  );
}

function TextInput({ id, value, onChange, maxLength, placeholder, disabled, invalid }: { id: string; value: string; onChange: (v: string) => void; maxLength: number; placeholder?: string; disabled?: boolean; invalid?: boolean }) {
  return (
    <input id={id} value={value} maxLength={maxLength} placeholder={placeholder} disabled={disabled} aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full border-b border-foreground/25 bg-transparent py-2.5 text-base outline-none transition-colors focus:border-foreground disabled:opacity-40 aria-invalid:border-destructive" />
  );
}

function Segmented<T extends string>({ label, value, onChange, options, wide }: { label: string; value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; wide?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex border border-border ${wide ? "w-full" : ""}`}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
          className={`min-h-11 px-4 text-xs tracking-wide transition-colors ${wide ? "flex-1" : ""} ${value === o.id ? "bg-foreground text-background" : "hover:bg-accent"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PurchaseRow({ size, finish, price, onAdd, compact }: { size: string; finish: string; price: number; onAdd: () => void; compact?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className={compact ? "text-xs text-muted-foreground" : "eyebrow"}>{size} in · {finish}</div>
        <div className={`font-display ${compact ? "text-2xl" : "text-4xl"}`}>${price}</div>
      </div>
      <Button variant="editorial" size={compact ? "lg" : "xl"} onClick={onAdd}>Add to Cart</Button>
    </div>
  );
}

function Errors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return <ul className="mt-3 space-y-1 text-xs text-destructive" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>;
}
