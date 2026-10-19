import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cartCount, useCart } from "@/lib/cart";
import { Logo } from "./Logo";

const NAV = [
  { to: "/create", label: "Create a trip map" },
  { to: "/journey", label: "Map Your Journey" },
  { to: "/styles", label: "Styles" },
  { to: "/faq", label: "FAQ" },
] as const;

export function SiteHeader() {
  const cart = useCart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // Back from Shopify after paying? Empty the items that were bought.
    void import("@/lib/checkout").then((m) => m.reconcileCheckout());
  }, []);
  const count = mounted ? cartCount(cart) : 0;
  // Phones: the menu folds into a button to save screen space.
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // A tap anywhere outside the header closes the menu.
    const onTap = (e: PointerEvent) => {
      if (!(e.target instanceof Node && document.querySelector("header")?.contains(e.target)))
        setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onTap);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onTap);
    };
  }, [open]);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-10">
        <Link to="/" className="text-[1.45rem]" aria-label="TripMyWay home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-9 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-[0.95rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "!text-foreground" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <Link
            to="/cart"
            className="inline-flex h-10 items-center gap-2 rounded-full border-2 border-foreground/15 px-4 text-sm font-semibold transition-colors hover:border-foreground"
            aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
          >
            Cart
            <span
              className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs ${count ? "bg-pin text-ink" : "bg-muted text-muted-foreground"}`}
            >
              {count}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="-mr-2 ml-2 grid h-11 w-11 place-items-center md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          className="absolute inset-x-0 top-full z-10 border-b border-border bg-background px-5 pb-4 shadow-lg md:hidden"
        >
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="block border-b border-border/60 py-4 font-display text-2xl font-semibold text-muted-foreground last:border-0"
              activeProps={{ className: "!text-foreground" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-ink text-[#fbfbf8]">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1fr_auto] md:items-end md:px-10">
        <div>
          <Link to="/" className="text-3xl" aria-label="TripMyWay home">
            <Logo inverse />
          </Link>
          <p className="mt-3 max-w-sm text-[#fbfbf8]/70">Every stop of your trip, on one print.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-medium">
          <Link to="/create" className="text-[#fbfbf8]/75 hover:text-[#fbfbf8]">
            Create a trip map
          </Link>
          <Link to="/journey" className="text-[#fbfbf8]/75 hover:text-[#fbfbf8]">
            Map Your Journey
          </Link>
          <Link to="/styles" className="text-[#fbfbf8]/75 hover:text-[#fbfbf8]">
            Styles
          </Link>
          <Link to="/about" className="text-[#fbfbf8]/75 hover:text-[#fbfbf8]">
            About
          </Link>
          <Link to="/faq" className="text-[#fbfbf8]/75 hover:text-[#fbfbf8]">
            FAQ
          </Link>
        </nav>
        <p className="text-xs text-[#fbfbf8]/55 md:col-span-2">
          Maps drawn from OpenStreetMap data © OpenStreetMap contributors.
        </p>
      </div>
    </footer>
  );
}
