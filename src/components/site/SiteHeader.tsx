import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cartCount, useCart } from "@/lib/cart";

const NAV = [
  { to: "/create", label: "Create" },
  { to: "/story", label: "Your Story" },
  { to: "/styles", label: "Styles" },
  { to: "/about", label: "About" },
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
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-10">
        <Link to="/" className="font-display text-2xl tracking-tight" aria-label="TripMyWay home">
          Trip<span className="italic text-ochre">My</span>Way
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-9 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-sm tracking-wide text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <Link to="/cart" className="text-sm tracking-wide">
            Cart <span className="text-muted-foreground">({count})</span>
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
              className="block border-b border-border/60 py-4 font-display text-2xl text-muted-foreground last:border-0"
              activeProps={{ className: "text-foreground" }}
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
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-12 md:flex-row md:items-end md:justify-between md:px-10">
        <div>
          <div className="font-display text-3xl">
            Trip<span className="italic text-ochre">My</span>Way
          </div>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Your place. Your story. Your map.
          </p>
        </div>
        <div className="flex gap-8 text-sm text-muted-foreground">
          <Link to="/create" className="hover:text-foreground">
            Create
          </Link>
          <Link to="/styles" className="hover:text-foreground">
            Styles
          </Link>
          <Link to="/about" className="hover:text-foreground">
            About
          </Link>
          <Link to="/faq" className="hover:text-foreground">
            FAQ
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">Map data © OpenStreetMap contributors</p>
      </div>
    </footer>
  );
}
