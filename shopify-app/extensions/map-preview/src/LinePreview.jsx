/** @jsxImportSource preact */
import "@shopify/ui-extensions/preact";
import { render } from "preact";

/**
 * Shows the customer's own map under its order line. The site stores a preview
 * image of every design and passes its URL on the line as the hidden
 * attribute `_preview` (see src/lib/preview.ts in the site).
 */
export default function extension() {
  render(<LinePreview />, document.body);
}

const ALLOWED = /^https:\/\/[^/]+\/previews\/[0-9a-f]{64}\.png$/;

function LinePreview() {
  const line = shopify.target.value;
  const url = line?.attributes?.find((a) => a.key === "_preview")?.value;
  if (!url || !ALLOWED.test(url)) return null;
  return (
    <s-box paddingBlockStart="small-200">
      <s-image src={url} alt="Your map" inlineSize="fill" loading="lazy" />
    </s-box>
  );
}
