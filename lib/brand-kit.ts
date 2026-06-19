// ── The craft kit — deterministic primitives, the "craft floor" ──
//
// A canonical <defs> block injected into EVERY generated SVG. Claude references
// these by id instead of hand-writing filters, patterns and shape polygons —
// which is where most craft bugs came from (mangled grain, uneven star spikes,
// wrong hard-shadow chains, serif fallback from a broken @import). The kit is
// guaranteed present and correct on every output; hand-drawn copies are
// stripped and replaced. This is the "deterministic, never re-drawn" layer.

const STAR12 =
  "0,-100 16,-59.9 50,-86.6 43.8,-43.8 86.6,-50 59.9,-16 100,0 59.9,16 86.6,50 43.8,43.8 50,86.6 16,59.9 0,100 -16,59.9 -50,86.6 -43.8,43.8 -86.6,50 -59.9,16 -100,0 -59.9,-16 -86.6,-50 -43.8,-43.8 -50,-86.6 -16,-59.9";

const SAWTOOTH =
  "0,-100 9.6,-85.5 22.3,-97.5 28.4,-81.2 43.4,-90.1 45.8,-72.8 62.3,-78.2 60.8,-60.8 78.2,-62.3 72.8,-45.8 90.1,-43.4 81.2,-28.4 97.5,-22.3 85.5,-9.6 100,0 85.5,9.6 97.5,22.3 81.2,28.4 90.1,43.4 72.8,45.8 78.2,62.3 60.8,60.8 62.3,78.2 45.8,72.8 43.4,90.1 28.4,81.2 22.3,97.5 9.6,85.5 0,100 -9.6,85.5 -22.3,97.5 -28.4,81.2 -43.4,90.1 -45.8,72.8 -62.3,78.2 -60.8,60.8 -78.2,62.3 -72.8,45.8 -90.1,43.4 -81.2,28.4 -97.5,22.3 -85.5,9.6 -100,0 -85.5,-9.6 -97.5,-22.3 -81.2,-28.4 -90.1,-43.4 -72.8,-45.8 -78.2,-62.3 -60.8,-60.8 -62.3,-78.2 -45.8,-72.8 -43.4,-90.1 -28.4,-81.2 -22.3,-97.5 -9.6,-85.5";

const FONT_IMPORT_CSS =
  "@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;900&amp;family=Bungee&amp;family=Anton&amp;family=Archivo+Black&amp;family=Titan+One&amp;family=Baloo+2:wght@800&amp;family=Caveat:wght@700&amp;family=Permanent+Marker&amp;display=swap');";

/** The canonical kit, injected into every output SVG right after <svg …>. */
export const BRAND_KIT_DEFS = `<defs id="mm-kit"><style>${FONT_IMPORT_CSS}</style>` +
  // Hard offset shadow — zero blur (feDropShadow with stdDeviation 0).
  `<filter id="hs" x="-30%" y="-30%" width="170%" height="170%"><feDropShadow dx="7" dy="7" stdDeviation="0" flood-color="#0a0a0a" flood-opacity="1"/></filter>` +
  // Film grain.
  `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0"/></filter>` +
  // Duotone photo (blue shadow → lime highlight by default; recolour by editing the table values inline if needed).
  `<filter id="duo"><feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="0.04 0.80"/><feFuncG type="table" tableValues="0.0 0.97"/><feFuncB type="table" tableValues="0.95 0.0"/></feComponentTransfer></filter>` +
  // Posterise photo.
  `<filter id="post"><feComponentTransfer><feFuncR type="discrete" tableValues="0 0.5 1"/><feFuncG type="discrete" tableValues="0 0.5 1"/><feFuncB type="discrete" tableValues="0 0.5 1"/></feComponentTransfer></filter>` +
  // Halftone dots (black; tint by drawing over a pop-colour rect with mix or by recolouring the use).
  `<pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="2.6" fill="#0a0a0a"/></pattern>` +
  // Perfect shapes — centred at 0,0, fill via currentColor so <use color="…"> recolours them.
  `<g id="mm-star12"><polygon points="${STAR12}" fill="currentColor"/></g>` +
  `<g id="mm-sawtooth"><polygon points="${SAWTOOTH}" fill="currentColor"/></g>` +
  `<g id="mm-sparkle"><path d="M0,-14 L3,-3 L14,0 L3,3 L0,14 L-3,3 L-14,0 L-3,-3 Z" fill="currentColor"/></g>` +
  `</defs>`;

/**
 * Inject the kit into a generated SVG. Strips any copies Claude emitted of the
 * canonical ids (and stray @import) so there are no duplicate-id collisions,
 * then prepends the guaranteed-correct kit right after the opening <svg> tag.
 */
export function injectBrandKit(svg: string): string {
  const cleaned = svg
    .replace(/<filter\s+id=["'](?:hs|grain|duo|post)["'][\s\S]*?<\/filter>/gi, "")
    .replace(/<pattern\s+id=["']dots["'][\s\S]*?<\/pattern>/gi, "")
    .replace(/<g\s+id=["']mm-(?:star12|sawtooth|sparkle)["'][\s\S]*?<\/g>/gi, "")
    .replace(/@import\s+url\([^)]*\)\s*;?/gi, "")
    // An emptied <style></style> left behind is harmless but tidy it.
    .replace(/<style>\s*<\/style>/gi, "");
  const m = cleaned.match(/<svg\b[^>]*>/i);
  if (!m) return cleaned;
  return cleaned.replace(m[0], m[0] + BRAND_KIT_DEFS);
}

/** Concise prompt section teaching Claude to reference the kit, not re-draw it. */
export const BRAND_KIT_DOC = [
  `━━ CRAFT KIT — PRE-LOADED, REFERENCE BY ID (never redefine) ━━`,
  `A canonical <defs id="mm-kit"> with the fonts and these ids is AUTOMATICALLY injected into your SVG. Reference them; do NOT paste your own copies (hand-drawn copies are stripped or fail validation):`,
  `  Filters — filter="url(#hs)" hard offset shadow (zero blur) · filter="url(#grain)" film grain · filter="url(#duo)" duotone photo · filter="url(#post)" posterise photo`,
  `  Pattern — fill="url(#dots)" halftone dots (black)`,
  `  Perfect shapes — <use> them (geometry is guaranteed even/correct), set color, wrap in a <g transform="translate(x y) scale(s) rotate(a)"> with your OWN centred <text> after the <use>:`,
  `    <use href="#mm-star12" color="#ffc000"/>   12-spike starburst, outer radius ≈100 (label container)`,
  `    <use href="#mm-sawtooth" color="#ffc000"/>  jagged sawtooth badge, outer radius ≈100 (label container)`,
  `    <use href="#mm-sparkle" color="#ff01aa"/>   4-point sparkle, radius ≈14 (scatter accent, no label)`,
  `  Do NOT emit @import, <filter id="hs/grain/duo/post">, <pattern id="dots">, or hand-drawn star/sawtooth polygons — they already exist.`,
  `  Worked starburst with label (top-right, $9):`,
  `    <g transform="translate(880 250) scale(0.95)"><use href="#mm-star12" color="#ffc000"/><text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-family="Montserrat" font-weight="900" font-size="30" fill="#0a0a0a">$9</text></g>`,
  `  Grain goes on a full-canvas rect AFTER all content, BEFORE the brand marks: <rect width="W" height="H" filter="url(#grain)" opacity="0.18"/>`,
  "",
].join("\n");
