import { useEffect, useId, useRef, useState } from "react";
import type { Location } from "@/types/product";
import { DEMO_LOCATIONS } from "@/config/products";
import { searchPlaces } from "@/lib/geocoding";

/** `compact`: just the search field (no "Selected" line or featured places) — for the story page. */
/** `upOnWide`: on wide screens the results open above the field (for a field pinned to the bottom of a panel). */
export function LocationSearch({
  value,
  onSelect,
  compact,
  placeholder = "Enter an address, city, neighborhood, or landmark",
  upOnWide,
}: {
  value: Location | null;
  onSelect: (l: Location) => void;
  compact?: boolean;
  placeholder?: string;
  upOnWide?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Location[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const r = await searchPlaces(query, ctrl.signal);
        setResults(r);
        setActive(0);
        setOpen(true);
        setStatus("idle");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pick = (l: Location) => {
    onSelect(l);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={box} className="space-y-4">
      <div className="relative">
        <label htmlFor={id} className="sr-only">
          {placeholder}
        </label>
        <input
          id={id}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % results.length);
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + results.length) % results.length);
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const r = results[active];
              if (r) pick(r);
            }
            if (e.key === "Escape") setOpen(false);
          }}
          className="h-13 w-full border-b border-foreground/30 bg-transparent py-3 text-base outline-none placeholder:text-muted-foreground/80 focus:border-foreground"
        />
        {status === "loading" && (
          <span className="absolute right-0 top-4 text-xs text-muted-foreground">Searching…</span>
        )}
        {open && results.length > 0 && (
          <ul
            id={`${id}-list`}
            role="listbox"
            className={`absolute z-30 mt-1 w-full border border-border bg-popover shadow-print fade-in ${upOnWide ? "lg:bottom-full lg:mb-1 lg:mt-0" : ""}`}
          >
            {results.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(r)}
                  className={`block w-full px-4 py-3 text-left ${i === active ? "bg-accent" : ""}`}
                >
                  <span className="block text-sm">{r.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.formattedAddress}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {status === "error" && (
        <p className="text-xs text-destructive" role="alert">
          Search is unavailable right now{compact ? "." : " — try a featured place below."}
        </p>
      )}
      {!compact && value && (
        <p className="text-sm">
          <span className="eyebrow mr-2">Selected</span>
          {value.formattedAddress}
        </p>
      )}
      {!compact && (
        <div>
          <p className="eyebrow mb-2">Or start with</p>
          <div className="flex flex-wrap gap-2">
            {DEMO_LOCATIONS.slice(1).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => pick(l)}
                aria-pressed={value?.id === l.id}
                className="border border-border px-3 py-2 text-xs tracking-wide transition-colors hover:border-foreground aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
