import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cartSubtotal, itemPanels, removeFromCart, updateQuantity, useCart } from "@/lib/cart";
import { getMapStyle } from "@/config/map-styles";
import { frameLabel, getFinish, getFrame, getPrintSize } from "@/config/products";
import { PosterPreview } from "@/components/poster/PosterPreview";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your Cart | TripMyWay" },
      { name: "description", content: "Review your personalized map prints." },
      { property: "og:title", content: "Your Cart | TripMyWay" },
      { property: "og:description", content: "Review your personalized map prints." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const items = useCart();
  const [mounted, setMounted] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="min-h-[60vh]" />;

  return (
    <div className="mx-auto max-w-5xl px-5 pt-12 md:px-10">
      <h1 className="text-5xl">Your cart</h1>
      {items.length === 0 ? (
        <div className="mt-12 border-t border-border pt-12">
          <p className="text-muted-foreground">Your cart is empty.</p>
          <Button asChild variant="editorial" size="lg" className="mt-6"><Link to="/create">Create Your Map</Link></Button>
        </div>
      ) : (
        <>
          <ul className="mt-10 divide-y divide-border border-y border-border">
            {items.map((it) => {
              const c = it.customization;
              const panels = itemPanels(it);
              const isSet = panels.length > 1;
              return (
                <li key={it.id} className={`grid gap-6 py-8 ${isSet ? "grid-cols-[150px_1fr] sm:grid-cols-[240px_1fr_auto]" : "grid-cols-[96px_1fr] sm:grid-cols-[140px_1fr_auto]"}`}>
                  <div className="grid gap-1.5 self-start bg-stage p-3" style={{ gridTemplateColumns: `repeat(${panels.length}, minmax(0, 1fr))` }}>
                    {panels.map((p, i) => <PosterPreview key={i} customization={p} className="w-full shadow-print" />)}
                  </div>
                  <div className="min-w-0">
                    {isSet ? (
                      <>
                        <p className="eyebrow">Set of {panels.length}</p>
                        <h2 className="text-2xl">{panels.map((p) => p.title).join(" · ")}</h2>
                      </>
                    ) : (
                      <>
                        <h2 className="text-2xl">{c.title}</h2>
                        <p className="text-sm text-muted-foreground">{c.subtitle}</p>
                      </>
                    )}
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <dt>Style</dt><dd>{getMapStyle(c.styleId).name}</dd>
                      <dt>Size</dt><dd>{getPrintSize(c.printSize).label} in{isSet ? " each" : ""} · {getFinish(c.finish).label}</dd>
                      {getFrame(c) !== "none" && (<><dt>Frame</dt><dd>{frameLabel(c)}{isSet ? " (each panel)" : ""}</dd></>)}
                      <dt>Layout</dt><dd>{c.layout === "fullBleed" ? "Edge to edge" : "With margin"}</dd>
                      {panels.map((p, i) => (
                        <div key={i} className="contents">
                          <dt>{isSet ? `Panel ${i + 1}` : "Place"}</dt><dd className="truncate">{p.location?.formattedAddress}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="inline-flex items-center border border-border" aria-label="Quantity">
                        <button className="h-9 w-9" onClick={() => updateQuantity(it.id, it.quantity - 1)} aria-label="Decrease quantity">−</button>
                        <span className="w-8 text-center text-sm">{it.quantity}</span>
                        <button className="h-9 w-9" onClick={() => updateQuantity(it.id, it.quantity + 1)} aria-label="Increase quantity">+</button>
                      </div>
                      <button className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground" onClick={() => removeFromCart(it.id)}>Remove</button>
                    </div>
                  </div>
                  <p className="col-start-2 font-display text-2xl sm:col-start-auto">${it.price * it.quantity}</p>
                </li>
              );
            })}
          </ul>
          <div className="mt-8 flex flex-col items-end gap-4">
            <p className="text-lg">Subtotal <span className="ml-4 font-display text-3xl">${cartSubtotal(items)}</span></p>
            <p className="text-xs text-muted-foreground">Shipping and taxes calculated at checkout.</p>
            <Button
              variant="editorial"
              size="xl"
              disabled={checkingOut}
              onClick={async () => {
                track("checkout_started", { items: items.length, value: cartSubtotal(items) });
                setCheckingOut(true);
                try {
                  // Finish any map previews (they go on the order), then hand the
                  // cart to Shopify and go to its secure checkout.
                  const [{ createCheckout }, { ensurePreviews }, { getCartItems }] = await Promise.all([
                    import("@/lib/checkout"),
                    import("@/lib/preview"),
                    import("@/lib/cart"),
                  ]);
                  await ensurePreviews(items);
                  window.location.assign(await createCheckout(getCartItems()));
                } catch (e) {
                  setCheckingOut(false);
                  toast("Checkout couldn't start", {
                    description: e instanceof Error ? e.message : "Please try again.",
                  });
                }
              }}
            >
              {checkingOut ? "Preparing your order…" : "Checkout"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
