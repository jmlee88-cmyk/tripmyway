# Showing the customer's map in Shopify emails

Every order line carries a hidden property `_preview`: the URL of a PNG of
the customer's design (for a set, all three panels side by side).

## Order confirmation (and Shipping confirmation)

Shopify admin → **Settings → Notifications → Customer notifications →
Order confirmation** → **Edit code**.

1. Find the product loop — the line that starts with
   `{% for line in subtotal_line_items %}` (or `{% for line in line_items %}`).
2. Inside it, find the product title, e.g.
   `<span class="order-list__item-title">{{ line_title }}&nbsp;&times;&nbsp;{{ line_display }}</span><br/>`
3. Paste this **right after** that line:

```liquid
{%- assign trip_preview = line.properties['_preview'] -%}
{%- if trip_preview != blank -%}
  <img src="{{ trip_preview }}" alt="Your map" width="280"
       style="display:block; width:280px; max-width:100%; height:auto; margin:10px 0 6px; border:0;">
{%- endif -%}
```

4. **Save**, then **Send test notification** / **Preview** to check.

Repeat for **Shipping confirmation** (and **Order edited**, if used).

The images are served from the TripMyWay site (`/previews/…png`) and are
cached by email clients.
