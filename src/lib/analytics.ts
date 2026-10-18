/**
 * Provider-agnostic analytics. INTEGRATION POINT: connect GA4 (gtag) or
 * Shopify customer events inside `track` — call sites stay unchanged.
 */
export type AnalyticsEvent =
  | "location_selected"
  | "style_selected"
  | "customization_started"
  | "preview_generated"
  | "size_selected"
  | "finish_selected"
  | "frame_selected"
  | "wizard_step"
  | "format_selected"
  | "panel_selected"
  | "story_submitted"
  | "story_recommended"
  | "story_to_editor"
  | "story_followup_answered"
  | "journey_submitted"
  | "journey_read"
  | "journey_followup_answered"
  | "journey_example_used"
  | "journey_photo_added"
  | "journey_photo_refused"
  | "journey_photo_cropped"
  | "add_to_cart"
  | "checkout_started";

export function track(event: AnalyticsEvent, payload: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { gtag?: (...a: unknown[]) => void; dataLayer?: unknown[] };
  if (w.gtag) w.gtag("event", event, payload);
  else (w.dataLayer ??= []).push({ event, ...payload });
  if (import.meta.env.DEV) console.debug("[analytics]", event, payload);
}
