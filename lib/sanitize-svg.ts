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
