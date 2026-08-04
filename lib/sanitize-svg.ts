import DOMPurify from "dompurify";

/**
 * Sanitise a generated SVG before it touches the DOM (strips <script>, event
 * handlers, external refs) WHILE preserving the presentation attributes the
 * brand engine depends on.
 *
 * DOMPurify's SVG profile allow-list omits `dominant-baseline` — without
 * re-adding it the sanitiser silently drops vertical centring, so the
 * displayed/exported asset no longer matches the validated raw SVG (centred
 * labels fall to their baseline). Keep this in sync with anything the engine
 * emits that the default profile doesn't cover.
 */
const ADD_ATTR = [
  "dominant-baseline",
  "alignment-baseline",
  "baseline-shift",
  "paint-order",
  "mix-blend-mode",
  "letter-spacing",
  "word-spacing",
  "text-rendering",
  "writing-mode",
  // <use href="#id" color="…"> drives the whole craft kit (starbursts,
  // sawtooths, sparkles) via currentColor — keep the ref + colour intact.
  "href",
  "xlink:href",
  "color",
];

// The brand kit renders shapes through <use href="#mm-star12"> etc. DOMPurify's
// svg profile drops <use> by default (it can reference external docs), so
// without this every starburst/sawtooth/sparkle silently vanishes from the
// displayed card and the exported raster. We re-allow <use> but, defence in
// depth, strip any href that isn't a same-document fragment (#id) so it can
// never pull an external/remote resource.
let hookInstalled = false;
function ensureUseHook() {
  if (hookInstalled) return;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if ((node.nodeName || "").toLowerCase() !== "use") return;
    const el = node as Element;
    const href =
      el.getAttribute("href") ??
      el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    if (href && !href.startsWith("#")) {
      el.removeAttribute("href");
      el.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
    }
  });
  hookInstalled = true;
}

export function sanitizeSvg(svg: string): string {
  ensureUseHook();
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_ATTR,
    ADD_TAGS: ["use"],
  });
}

/**
 * Rewrite every `id` in one SVG (and every reference to it) with a unique
 * prefix, so multiple generated SVGs can live in the SAME document without
 * fighting over ids.
 *
 * Inline SVGs share ONE document-wide id namespace: `url(#photoClip)` resolves
 * to the FIRST `#photoClip` in the DOM, not the one in its own <svg>. Every
 * generation carries the craft kit (`hs`, `grain`, `duo`, `post`, `dots`, the
 * `mm-*` shapes) plus its own clips/gradients, so with two on a page the second
 * one silently borrows the first one's geometry. That is how deck thumbnails
 * lost their photos: the gallery's design tiles render first and define their
 * own `photoClip` (a 1080×1080 path ending at x≈960), so a slide's photo at
 * x≈1180 in a 1920×1080 canvas got clipped to nothing — the frame drew, the
 * picture vanished. Filters/gradients collide the same way (a duotone from one
 * card leaking onto another).
 *
 * Call this AFTER sanitising, with a per-instance prefix (React's useId()).
 */
export function scopeSvgIds(svg: string, prefix: string): string {
  const ids = [...new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))];
  if (!ids.length) return svg;
  const p = prefix.replace(/[^a-zA-Z0-9_-]/g, "") + "-";
  for (const id of ids) {
    const e = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    svg = svg
      .replace(new RegExp(`\\bid="${e}"`, "g"), `id="${p}${id}"`)
      .replace(new RegExp(`url\\(\\s*#${e}\\s*\\)`, "g"), `url(#${p}${id})`)
      .replace(new RegExp(`((?:xlink:)?href)="#${e}"`, "g"), `$1="#${p}${id}"`);
  }
  return svg;
}
