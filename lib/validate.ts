// Post-generation brand validation — the hard gate, not a suggestion.
// Parses Claude's SVG for off-palette colours, unapproved fonts, soft
// shadows and gradient abuse. Any violation triggers auto-regeneration.

export interface ValidateOptions {
  /** Hex allow-list (any case, 3/4/6/8-digit accepted on both sides). */
  allowedColors: string[];
  /** Named font families allowed. CSS generics (sans-serif…) always pass. */
  allowedFonts: string[];
  /** Max <linearGradient> elements (brand rule: 1). Omit for unlimited. */
  maxLinearGradients?: number;
  /** Radial gradients allowed? Brand rule: no. */
  allowRadialGradients?: boolean;
  /** Reject any feGaussianBlur / feDropShadow with stdDeviation > 0. */
  forbidBlur?: boolean;
  /** Detect overlapping <text> elements via estimated bounding boxes. */
  checkTextOverlap?: boolean;
  /** Deck slides: flag body text that straddles a photo/panel edge (text
   *  partly under an opaque image = clipped). Requires checkTextOverlap+canvas. */
  checkImageTextClip?: boolean;
  /** Canvas size — enables small-decorative-image-over-text detection. */
  canvas?: { w: number; h: number };
  /** Reject empty starbursts and text overflowing pills/badges/buttons. */
  checkContainers?: boolean;
  /** Brief explicitly placed the starburst — skip the top-right default check. */
  starburstAnywhere?: boolean;
}

type Box = { x1: number; y1: number; x2: number; y2: number; label: string };

function boxArea(b: Box): number {
  return Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
}

function boxOverlap(a: Box, b: Box): number {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Pull a numeric value from attribute (x="90") or inline-style (x: 90px) form. */
function numFrom(attrs: string, name: string): number | null {
  const a = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']\\s*(-?[\\d.]+)`));
  if (a) return parseFloat(a[1]);
  const s = attrs.match(new RegExp(`${name}\\s*:\\s*(-?[\\d.]+)`));
  return s ? parseFloat(s[1]) : null;
}

type TextEl = {
  x: number;
  y: number;
  fontSize: number;
  anchor: "start" | "middle" | "end";
  baseline: string;
  content: string;
  box: Box;
  at: number; // source-order index (for z-order occlusion checks)
};

/**
 * Character ranges of the source that sit inside a <g transform="…"> group.
 * Text inside those groups uses LOCAL coordinates (e.g. a starburst label at
 * x="0" y="0") — absolute-coordinate checks must skip them.
 */
function transformedRanges(src: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const stack: Array<{ transformed: boolean; start: number }> = [];
  const re = /<g\b[^>]*>|<\/g>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[0][1] === "/") {
      const top = stack.pop();
      if (top?.transformed) ranges.push([top.start, m.index]);
    } else {
      stack.push({ transformed: /transform\s*=/i.test(m[0]), start: m.index });
    }
  }
  return ranges;
}

/**
 * Parse untransformed <text> elements with their raw centring attributes.
 * Width ≈ chars × font-size × 0.6; box height is cap-height-tight so normally
 * line-spaced stacked headlines don't false-positive. Text that is itself
 * transformed, tspan-repositioned, or inside a transformed <g> (local
 * coordinates) is skipped — the prompt rules cover those.
 */
function parseTexts(svg: string): TextEl[] {
  const body = svg.replace(/<defs[\s\S]*?<\/defs>/gi, "");
  const gRanges = transformedRanges(body);
  const els: TextEl[] = [];
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const attrs = m[1];
    const inner = m[2];
    if (/transform\s*=/i.test(attrs)) continue;
    const at = m.index;
    if (gRanges.some(([s, e]) => at > s && at < e)) continue;
    if (/<tspan[^>]*\b(?:dy|dx|x|y)\s*=/i.test(inner)) continue;
    const content = inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!content) continue;
    const fontSize = numFrom(attrs, "font-size") ?? 16;
    const x = numFrom(attrs, "x") ?? 0;
    const y = numFrom(attrs, "y") ?? 0;
    const anchor = (attrs.match(/text-anchor\s*[:=]\s*["']?\s*(middle|end|start)/i)?.[1] ??
      "start").toLowerCase() as "start" | "middle" | "end";
    const baseline = (attrs.match(/dominant-baseline\s*[:=]\s*["']?\s*([a-z-]+)/i)?.[1] ?? "").toLowerCase();
    const width = content.length * fontSize * 0.6;
    const x1 = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
    els.push({
      x, y, fontSize, anchor, baseline, content, at: m.index,
      box: { x1, y1: y - fontSize * 0.75, x2: x1 + width, y2: y + fontSize * 0.05, label: content.slice(0, 28) },
    });
  }
  return els;
}

function estimateTextBoxes(svg: string): Box[] {
  return parseTexts(svg).map((t) => t.box);
}

/** Boxes for untransformed <image> tags with explicit geometry. */
function imageBoxes(svg: string): Box[] {
  const boxes: Box[] = [];
  for (const tag of svg.match(/<image\b[^>]*>/gi) ?? []) {
    if (/transform\s*=/i.test(tag)) continue;
    const w = numFrom(tag, "width");
    const h = numFrom(tag, "height");
    if (w === null || h === null) continue;
    const x = numFrom(tag, "x") ?? 0;
    const y = numFrom(tag, "y") ?? 0;
    boxes.push({ x1: x, y1: y, x2: x + w, y2: y + h, label: "image" });
  }
  return boxes;
}

/** Inner content of the <g> that wraps the polygon at index `polyAt`, or null. */
function enclosingGroupContent(svg: string, polyAt: number): string | null {
  const open = svg.lastIndexOf("<g", polyAt);
  if (open === -1) return null;
  const openEnd = svg.indexOf(">", open);
  if (openEnd === -1 || openEnd > polyAt) return null;
  let depth = 1;
  let i = openEnd + 1;
  while (i < svg.length && depth > 0) {
    const nextOpen = svg.indexOf("<g", i);
    const nextClose = svg.indexOf("</g>", i);
    if (nextClose === -1) return null;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + 2;
    } else {
      depth--;
      if (depth === 0) return svg.slice(openEnd + 1, nextClose);
      i = nextClose + 4;
    }
  }
  return null;
}

/** Opening tag of the <g> that wraps position `polyAt`, or null. */
function enclosingGroupTag(svg: string, polyAt: number): string | null {
  const open = svg.lastIndexOf("<g", polyAt);
  if (open === -1) return null;
  const openEnd = svg.indexOf(">", open);
  if (openEnd === -1 || openEnd > polyAt) return null;
  return svg.slice(open, openEnd + 1);
}

/**
 * Starburst rules. A <polygon> with ≥16 vertices is a starburst.
 * 1. It must contain a label (<text> or <image>) inside its <g> — never bare.
 * 2. Its centre belongs in the TOP-RIGHT corner region of the canvas.
 * 3. Its disc must not overlap any absolute-positioned text.
 * Position/overlap need the <g transform="translate(x y) scale(s)"> to be
 * resolvable; stars without one are skipped (prompt rules still apply).
 */
function starburstViolations(
  svg: string,
  canvas?: { w: number; h: number },
  anywhere = false,
): string[] {
  const out: string[] = [];
  // Exclude the injected kit <defs> — its <g id="mm-star12"> definitions hold
  // the shape polygons and must not be mistaken for empty on-canvas starbursts.
  const body = svg.replace(/<defs[\s\S]*?<\/defs>/gi, "");
  const texts = canvas ? estimateTextBoxes(svg) : [];
  let empties = 0;

  // Star/sawtooth instances: hand-drawn inline polygons (≥16 verts) AND the
  // kit's <use href="#mm-star12|#mm-sawtooth">.
  type Dev = { at: number; sawtooth: boolean };
  const devs: Dev[] = [];
  let m: RegExpExecArray | null;
  const polyRe = /<polygon\b[^>]*\bpoints\s*=\s*"([^"]+)"[^>]*>/gi;
  while ((m = polyRe.exec(body))) {
    const coords = m[1].match(/-?[\d.]+/g) ?? [];
    if (coords.length < 32) continue; // <16 vertices → not a starburst
    devs.push({ at: m.index, sawtooth: coords.length >= 80 });
  }
  const useRe = /<use\b[^>]*href\s*=\s*["']#mm-(star12|sawtooth)["'][^>]*>/gi;
  while ((m = useRe.exec(body))) {
    devs.push({ at: m.index, sawtooth: m[1] === "sawtooth" });
  }

  for (const dev of devs) {
    const content = enclosingGroupContent(body, dev.at);
    if (content !== null) {
      const inner = content
        .replace(/<polygon\b[^>]*>/gi, "")
        .replace(/<use\b[^>]*>/gi, "");
      if (!/<text\b/i.test(inner) && !/<image\b/i.test(inner)) empties++;
    }

    // Non-uniform scaling distorts the tooth/spike geometry — flag squash.
    const gTagAny = enclosingGroupTag(body, dev.at);
    const sc = gTagAny?.match(/scale\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/);
    if (sc) {
      const sx = Math.abs(parseFloat(sc[1]));
      const sy = Math.abs(parseFloat(sc[2]));
      if (sx > 0 && sy > 0 && Math.max(sx, sy) / Math.min(sx, sy) > 1.3) {
        out.push(
          `A ${dev.sawtooth ? "sawtooth badge" : "starburst"} is stretched (scale ${sc[1]}×${sc[2]}) — badges scale near-uniformly (≤1.25:1). Use a larger badge or shorter copy instead of squashing the shape.`,
        );
      }
    }

    if (!canvas || dev.sawtooth) continue;
    const tr = gTagAny?.match(/translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/);
    if (!gTagAny || !tr) continue;
    const cx = parseFloat(tr[1]);
    const cy = parseFloat(tr[2]);
    const scale = Math.abs(parseFloat(gTagAny.match(/scale\(\s*(-?[\d.]+)/)?.[1] ?? "1"));
    const r = 100 * scale; // canonical star outer radius is 100 local units

    // Default placement is top-right — waived when the brief explicitly
    // positioned the starburst. The no-text-overlap rule below always applies.
    if (!anywhere && !(cx >= canvas.w * 0.55 && cy <= canvas.h * 0.4)) {
      out.push(
        `A starburst is centred at (${Math.round(cx)}, ${Math.round(cy)}) — starbursts ALWAYS belong in the top-right corner region (centre x ≥ ${Math.round(canvas.w * 0.6)}, y ≤ ${Math.round(canvas.h * 0.3)}), clear of all text, unless the brief explicitly asks for a different position.`,
      );
    }
    const starBox: Box = { x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r, label: "starburst" };
    for (const t of texts) {
      if (boxOverlap(starBox, t) > 0) {
        out.push(
          `A starburst overlaps the text "${t.label}" — starbursts must sit completely clear of every text element. Keep them in the top-right corner region.`,
        );
        break;
      }
    }
  }
  if (empties > 0) {
    out.push(
      `${empties} empty starburst${empties > 1 ? "s" : ""} — every starburst MUST contain a centred label (short UPPERCASE text like "4TH JULY" or "FREE SHOTS") or the ALL IN logo image, inside the same <g>. Never output a bare starburst.`,
    );
  }
  return out;
}

/**
 * Z-order occlusion: a filled shape drawn AFTER a text element (so it renders
 * on top) that overlaps it is covering that text — e.g. a pill block dropped
 * over the headline. Text drawn on top of a panel is the legitimate case and
 * is not flagged (text comes after the panel in source order). Uses the same
 * defs-stripped `body` indexing as parseTexts so positions line up.
 */
function occlusionViolations(svg: string, canvas: { w: number; h: number }): string[] {
  const out = new Set<string>();
  const body = svg.replace(/<defs[\s\S]*?<\/defs>/gi, "");
  const gRanges = transformedRanges(body);
  const inTransformed = (at: number) => gRanges.some(([s, e]) => at > s && at < e);
  const texts = parseTexts(svg).filter((t) => !inTransformed(t.at));
  if (texts.length === 0) return [];

  const canvasArea = canvas.w * canvas.h;
  const re = /<rect\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const tag = m[1];
    const at = m.index;
    if (/transform\s*=/i.test(tag) || inTransformed(at)) continue;
    if (/fill\s*=\s*["']?\s*(none|url)/i.test(tag)) continue;
    const fo = tag.match(/fill-opacity\s*=\s*["']?\s*([\d.]+)/i);
    if (fo && parseFloat(fo[1]) < 0.6) continue; // see-through overlays are fine
    const w = numFrom(tag, "width");
    const h = numFrom(tag, "height");
    if (w === null || h === null) continue;
    const area = w * h;
    if (area < canvasArea * 0.01 || area > canvasArea * 0.55) continue;
    const x = numFrom(tag, "x") ?? 0;
    const y = numFrom(tag, "y") ?? 0;
    const rect: Box = { x1: x, y1: y, x2: x + w, y2: y + h, label: "shape" };
    for (const t of texts) {
      if (t.at < at && boxOverlap(rect, t.box) > 0.25 * boxArea(t.box)) {
        out.add(
          `A filled shape is covering the text "${t.box.label}" — pills, blocks and panels must sit CLEAR of headlines and body text, never on top of them. Move the shape or the text so no lettering is occluded.`,
        );
      }
    }
  }
  return [...out];
}

/**
 * Empty panels — a mid-sized filled <rect> with no text or image anywhere on
 * it reads as a glaring dead box (often a hallucinated content area). Full
 * backgrounds (>45% of canvas) and small accents (<5%) are exempt.
 */
function emptyPanelViolations(svg: string, canvas: { w: number; h: number }): string[] {
  const out: string[] = [];
  const texts = estimateTextBoxes(svg);
  const images = imageBoxes(svg);
  const canvasArea = canvas.w * canvas.h;
  const gRanges = transformedRanges(svg);
  const rectRe = /<rect\b[^>]*>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rectRe.exec(svg))) {
    const tag = rm[0];
    if (/transform\s*=/i.test(tag)) continue;
    // Rects inside transformed groups (label stickers etc.) use local coords.
    if (gRanges.some(([s, e]) => rm!.index > s && rm!.index < e)) continue;
    if (/fill\s*=\s*["']?\s*(none|url)/i.test(tag)) continue;
    const w = numFrom(tag, "width");
    const h = numFrom(tag, "height");
    if (w === null || h === null) continue;
    const area = w * h;
    if (area < canvasArea * 0.05 || area > canvasArea * 0.45) continue;
    const x = numFrom(tag, "x") ?? 0;
    const y = numFrom(tag, "y") ?? 0;
    const box: Box = { x1: x, y1: y, x2: x + w, y2: y + h, label: "panel" };
    const hasContent =
      texts.some((t) => boxOverlap(box, t) > 0) ||
      images.some((im) => boxOverlap(box, im) > 0);
    if (!hasContent) {
      out.push(
        `An empty ${Math.round(w)}×${Math.round(h)} panel/box sits at (${Math.round(x)}, ${Math.round(y)}) with nothing on it — remove it or put real content (text/photo) inside. Never draw empty boxes.`,
      );
    }
  }
  return out;
}

type Container = { x1: number; y1: number; x2: number; y2: number; innerW: number };

/** Pill/badge/button containers: rounded <rect rx> and <ellipse>, badge-sized. */
function containerBoxes(svg: string, canvas: { w: number; h: number }): Container[] {
  const out: Container[] = [];
  const maxW = canvas.w * 0.6;
  const maxH = canvas.h * 0.22;
  const gRanges = transformedRanges(svg);

  const rectRe = /<rect\b[^>]*>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rectRe.exec(svg))) {
    const tag = rm[0];
    if (/transform\s*=/i.test(tag)) continue;
    // Local coordinates inside a rotated/translated group — unresolvable here.
    if (gRanges.some(([s, e]) => rm!.index > s && rm!.index < e)) continue;
    const rx = numFrom(tag, "rx");
    if (rx === null || rx <= 0) continue; // only rounded rects (pills/buttons)
    const w = numFrom(tag, "width");
    const h = numFrom(tag, "height");
    if (w === null || h === null || h < 28) continue;
    if (w > maxW || h > maxH) continue;
    const x = numFrom(tag, "x") ?? 0;
    const y = numFrom(tag, "y") ?? 0;
    // Pills round off ~h/2 at each end. Text can sit slightly into the caps,
    // so only subtract one radius — keeps the overflow check from false-firing.
    out.push({ x1: x, y1: y, x2: x + w, y2: y + h, innerW: Math.max(w * 0.6, w - h * 0.5) });
  }
  for (const tag of svg.match(/<ellipse\b[^>]*>/gi) ?? []) {
    if (/transform\s*=/i.test(tag)) continue;
    const rx = numFrom(tag, "rx");
    const ry = numFrom(tag, "ry");
    if (rx === null || ry === null) continue;
    const w = rx * 2;
    const h = ry * 2;
    if (h < 28 || w > maxW || h > maxH) continue;
    const cx = numFrom(tag, "cx") ?? 0;
    const cy = numFrom(tag, "cy") ?? 0;
    out.push({ x1: cx - rx, y1: cy - ry, x2: cx + rx, y2: cy + ry, innerW: w * 0.72 });
  }
  return out;
}

/**
 * Text inside a pill/badge/button must (a) fit within it and (b) be strictly
 * centred. Centring is enforced structurally: the text must use
 * text-anchor="middle" + dominant-baseline="central" with x/y at the
 * container's exact centre. This removes the baseline-guesswork that leaves
 * text sitting high/low. For each badge-sized rounded container, find the
 * untransformed text centred inside it and check fit + centring.
 */
const CENTERED_BASELINES = new Set(["central", "middle"]);

function containerViolations(svg: string, canvas: { w: number; h: number }): string[] {
  const out = new Set<string>();
  const containers = containerBoxes(svg, canvas);
  if (containers.length === 0) return [];
  const texts = parseTexts(svg);

  for (const c of containers) {
    const cx = (c.x1 + c.x2) / 2;
    const cy = (c.y1 + c.y2) / 2;
    const cw = c.x2 - c.x1;
    const ch = c.y2 - c.y1;
    for (const t of texts) {
      const tcx = (t.box.x1 + t.box.x2) / 2;
      const tcy = (t.box.y1 + t.box.y2) / 2;
      if (tcx < c.x1 || tcx > c.x2 || tcy < c.y1 || tcy > c.y2) continue; // not this badge's text

      // Fit (10% slack — the width estimate is approximate, only flag clear overflow)
      if (t.box.x2 - t.box.x1 > c.innerW * 1.1) {
        out.add(
          `Text "${t.content.slice(0, 28)}" overflows its pill/badge — the text is wider than the shape. Shorten the text or shrink the font so it fits inside with padding.`,
        );
      }
      // Horizontal centring (strict): must be text-anchor="middle" at centre x
      if (t.anchor !== "middle" || Math.abs(t.x - cx) > Math.max(14, cw * 0.08)) {
        out.add(
          `Text "${t.content.slice(0, 28)}" is NOT horizontally centred in its pill/badge — set text-anchor="middle" and x="${Math.round(cx)}" (the container's exact centre).`,
        );
      }
      // Vertical centring (strict): must use dominant-baseline central at centre y
      else if (!CENTERED_BASELINES.has(t.baseline) || Math.abs(t.y - cy) > Math.max(12, ch * 0.2)) {
        out.add(
          `Text "${t.content.slice(0, 28)}" is NOT vertically centred in its pill/badge — set dominant-baseline="central" and y="${Math.round(cy)}" (the container's exact centre). Never centre by guessing the baseline.`,
        );
      }
    }
  }
  return [...out];
}

const GENERIC_FONTS = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy",
  "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded",
  "inherit", "initial", "unset",
]);

// Keywords that appear in colour positions but aren't colours.
const NON_COLOR_KEYWORDS = new Set([
  "none", "url", "currentcolor", "transparent", "inherit", "initial", "unset", "context-fill", "context-stroke",
  "rgb", "rgba", "hsl", "hsla", // handled by the rgb() parser / not named colours
]);

// Full CSS named-colour table → hex. Used both to resolve named colours in
// paint slots ("white" passes when #ffffff is allowed; "black" fails when the
// brand black is #0a0a0a) and to detect colours a marketer states in a brief.
const NAMED_COLORS: Record<string, string> = {
  aliceblue: "#f0f8ff", antiquewhite: "#faebd7", aqua: "#00ffff", aquamarine: "#7fffd4",
  azure: "#f0ffff", beige: "#f5f5dc", bisque: "#ffe4c4", black: "#000000",
  blanchedalmond: "#ffebcd", blue: "#0000ff", blueviolet: "#8a2be2", brown: "#a52a2a",
  burlywood: "#deb887", cadetblue: "#5f9ea0", chartreuse: "#7fff00", chocolate: "#d2691e",
  coral: "#ff7f50", cornflowerblue: "#6495ed", cornsilk: "#fff8dc", crimson: "#dc143c",
  cyan: "#00ffff", darkblue: "#00008b", darkcyan: "#008b8b", darkgoldenrod: "#b8860b",
  darkgray: "#a9a9a9", darkgreen: "#006400", darkgrey: "#a9a9a9", darkkhaki: "#bdb76b",
  darkmagenta: "#8b008b", darkolivegreen: "#556b2f", darkorange: "#ff8c00", darkorchid: "#9932cc",
  darkred: "#8b0000", darksalmon: "#e9967a", darkseagreen: "#8fbc8f", darkslateblue: "#483d8b",
  darkslategray: "#2f4f4f", darkslategrey: "#2f4f4f", darkturquoise: "#00ced1", darkviolet: "#9400d3",
  deeppink: "#ff1493", deepskyblue: "#00bfff", dimgray: "#696969", dimgrey: "#696969",
  dodgerblue: "#1e90ff", firebrick: "#b22222", floralwhite: "#fffaf0", forestgreen: "#228b22",
  fuchsia: "#ff00ff", gainsboro: "#dcdcdc", ghostwhite: "#f8f8ff", gold: "#ffd700",
  goldenrod: "#daa520", gray: "#808080", green: "#008000", greenyellow: "#adff2f",
  grey: "#808080", honeydew: "#f0fff0", hotpink: "#ff69b4", indianred: "#cd5c5c",
  indigo: "#4b0082", ivory: "#fffff0", khaki: "#f0e68c", lavender: "#e6e6fa",
  lavenderblush: "#fff0f5", lawngreen: "#7cfc00", lemonchiffon: "#fffacd", lightblue: "#add8e6",
  lightcoral: "#f08080", lightcyan: "#e0ffff", lightgoldenrodyellow: "#fafad2", lightgray: "#d3d3d3",
  lightgreen: "#90ee90", lightgrey: "#d3d3d3", lightpink: "#ffb6c1", lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa", lightskyblue: "#87cefa", lightslategray: "#778899", lightslategrey: "#778899",
  lightsteelblue: "#b0c4de", lightyellow: "#ffffe0", lime: "#00ff00", limegreen: "#32cd32",
  linen: "#faf0e6", magenta: "#ff00ff", maroon: "#800000", mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd", mediumorchid: "#ba55d3", mediumpurple: "#9370db", mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee", mediumspringgreen: "#00fa9a", mediumturquoise: "#48d1cc", mediumvioletred: "#c71585",
  midnightblue: "#191970", mintcream: "#f5fffa", mistyrose: "#ffe4e1", moccasin: "#ffe4b5",
  navajowhite: "#ffdead", navy: "#000080", oldlace: "#fdf5e6", olive: "#808000",
  olivedrab: "#6b8e23", orange: "#ffa500", orangered: "#ff4500", orchid: "#da70d6",
  palegoldenrod: "#eee8aa", palegreen: "#98fb98", paleturquoise: "#afeeee", palevioletred: "#db7093",
  papayawhip: "#ffefd5", peachpuff: "#ffdab9", peru: "#cd853f", pink: "#ffc0cb",
  plum: "#dda0dd", powderblue: "#b0e0e6", purple: "#800080", rebeccapurple: "#663399",
  red: "#ff0000", rosybrown: "#bc8f8f", royalblue: "#4169e1", saddlebrown: "#8b4513",
  salmon: "#fa8072", sandybrown: "#f4a460", seagreen: "#2e8b57", seashell: "#fff5ee",
  sienna: "#a0522d", silver: "#c0c0c0", skyblue: "#87ceeb", slateblue: "#6a5acd",
  slategray: "#708090", slategrey: "#708090", snow: "#fffafa", springgreen: "#00ff7f",
  steelblue: "#4682b4", tan: "#d2b48c", teal: "#008080", thistle: "#d8bfd8",
  tomato: "#ff6347", turquoise: "#40e0d0", violet: "#ee82ee", wheat: "#f5deb3",
  white: "#ffffff", whitesmoke: "#f5f5f5", yellow: "#ffff00", yellowgreen: "#9acd32",
};

// Multi-word phrasings a marketer is likely to type, mapped to a CSS key.
const COLOR_PHRASES: Record<string, string> = {
  "hot pink": "hotpink", "sky blue": "skyblue", "navy blue": "navy",
  "royal blue": "royalblue", "forest green": "forestgreen", "lime green": "limegreen",
  "off white": "white", "off-white": "white", "deep pink": "deeppink",
};

/**
 * Pull colours a user explicitly named in a brief — hex codes and CSS colour
 * words — returned as normalised hex. Used to widen the allow-list when a
 * marketer asks for a specific colour. Errs toward inclusion (the lenient
 * direction): a colour word in the brief becomes a permitted exception.
 */
export function extractStatedColors(text: string): string[] {
  const out = new Set<string>();
  const lower = text.toLowerCase();

  for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const n = normalizeHex(m[0]);
    if (n) out.add(n);
  }
  for (const m of lower.matchAll(/rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})/g)) {
    out.add(rgbToHex(Number(m[1]), Number(m[2]), Number(m[3])));
  }
  for (const [phrase, key] of Object.entries(COLOR_PHRASES)) {
    if (lower.includes(phrase)) out.add(NAMED_COLORS[key]);
  }
  for (const m of lower.matchAll(/[a-z]+/g)) {
    const hex = NAMED_COLORS[m[0]];
    if (hex) out.add(hex);
  }
  return [...out];
}

/** Normalise any hex form to lowercase 6-digit #rrggbb (alpha dropped). */
function normalizeHex(raw: string): string | null {
  const h = raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(h))
    return "#" + [...h.slice(1)].map((c) => c + c).join("");
  if (/^#[0-9a-f]{4}$/.test(h))
    return "#" + [...h.slice(1, 4)].map((c) => c + c).join("");
  if (/^#[0-9a-f]{6}$/.test(h)) return h;
  if (/^#[0-9a-f]{8}$/.test(h)) return h.slice(0, 7);
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Split a font-family list into clean family names. */
function parseFamilies(list: string): string[] {
  return list
    .split(",")
    .map((f) =>
      f.trim().replace(/^["']|["']$/g, "").split('"')[0].split("'")[0].trim(),
    )
    .filter(Boolean);
}

/**
 * Escape stray ampersands (e.g. the Google Fonts @import URL) so the SVG is
 * valid XML. Lenient HTML rendering tolerates raw "&", but every strict
 * parser — resvg, DOMParser("image/svg+xml"), <img> SVG loading — rejects it.
 */
export function escapeStrayAmpersands(svg: string): string {
  return svg.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
}

/**
 * Force the root <svg>'s namespaces to the correct values. Claude occasionally
 * hallucinates a bogus `xmlns` (e.g. copying a bank-image URL prefix into the
 * namespace slot) — a wrong xmlns makes EVERY parser (resvg, the browser's
 * SVG-as-img, DOMParser) treat the document as non-SVG, so it renders blank or
 * fails with "no root node". Rewriting the root namespaces is always safe.
 */
export function normalizeSvgRoot(svg: string): string {
  const usesXlink = /xlink:href/.test(svg);
  return svg.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
    let a = attrs;
    a = /\bxmlns\s*=/.test(a)
      ? a.replace(/\bxmlns\s*=\s*("[^"]*"|'[^']*')/i, 'xmlns="http://www.w3.org/2000/svg"')
      : ` xmlns="http://www.w3.org/2000/svg"${a}`;
    if (/\bxmlns:xlink\s*=/.test(a)) {
      a = a.replace(/\bxmlns:xlink\s*=\s*("[^"]*"|'[^']*')/i, 'xmlns:xlink="http://www.w3.org/1999/xlink"');
    } else if (usesXlink) {
      a = `${a} xmlns:xlink="http://www.w3.org/1999/xlink"`;
    }
    return `<svg${a}>`;
  });
}

export function validateSvg(svg: string, opts: ValidateOptions): string[] {
  const violations = new Set<string>();

  // Strip fragment references (url(#id), href="#id") so hex-looking ids
  // like url(#fade) don't false-positive as colours.
  const scrubbed = svg
    .replace(/url\(\s*#[^)]*\)/g, "url(REF)")
    .replace(/(xlink:)?href\s*=\s*"#[^"]*"/g, 'href="REF"')
    .replace(/(xlink:)?href\s*=\s*'#[^']*'/g, "href='REF'");

  // ── Colours ────────────────────────────────────────────────────────────────
  const allowed = new Set(
    opts.allowedColors.map(normalizeHex).filter(Boolean) as string[],
  );
  const found = new Set<string>();

  for (const m of scrubbed.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const n = normalizeHex(m[0]);
    if (n) found.add(n);
  }
  for (const m of scrubbed.matchAll(
    /rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})/g,
  )) {
    found.add(rgbToHex(Number(m[1]), Number(m[2]), Number(m[3])));
  }
  // Named colours in paint positions (fill="white", style="stroke: black")
  for (const m of scrubbed.matchAll(
    /(?:fill|stroke|stop-color|flood-color|color)\s*[:=]\s*["']?\s*([a-zA-Z-]+)/g,
  )) {
    const word = m[1].toLowerCase();
    if (NON_COLOR_KEYWORDS.has(word)) continue;
    const hex = NAMED_COLORS[word];
    if (hex) found.add(hex);
    else if (!(word in NAMED_COLORS) && /^[a-z]+$/.test(word) && word.length > 2) {
      // Unknown word in a colour slot — only flag if it's a real CSS colour-ish
      // token, not an SVG keyword like "evenodd"/"round"/"butt".
      const SVG_KEYWORDS = new Set(["evenodd", "nonzero", "round", "butt", "square", "miter", "bevel"]);
      if (!SVG_KEYWORDS.has(word)) {
        violations.add(
          `Named colour "${word}" is not allowed — use an exact hex from the approved palette.`,
        );
      }
    }
  }
  for (const c of found) {
    if (!allowed.has(c)) {
      violations.add(
        `Off-palette colour ${c} — replace it with one of the approved brand colours.`,
      );
    }
  }

  // ── Fonts ──────────────────────────────────────────────────────────────────
  const allowedFonts = new Set(opts.allowedFonts.map((f) => f.toLowerCase()));
  const familyLists: string[] = [];
  for (const m of svg.matchAll(/font-family\s*=\s*"([^"]+)"/g)) familyLists.push(m[1]);
  for (const m of svg.matchAll(/font-family\s*=\s*'([^']+)'/g)) familyLists.push(m[1]);
  for (const m of svg.matchAll(/font-family\s*:\s*([^;}<>]+)/g)) familyLists.push(m[1]);

  for (const list of familyLists) {
    for (const family of parseFamilies(list)) {
      const f = family.toLowerCase();
      if (GENERIC_FONTS.has(f)) continue;
      if (!allowedFonts.has(f)) {
        violations.add(
          `Font "${family}" is not allowed — use only: ${opts.allowedFonts.join(", ")}.`,
        );
      }
    }
  }

  // ── Soft shadows (blur) ────────────────────────────────────────────────────
  if (opts.forbidBlur) {
    for (const m of svg.matchAll(
      /<fe(?:GaussianBlur|DropShadow)[^>]*stdDeviation\s*=\s*["']?\s*([\d.]+)/g,
    )) {
      if (parseFloat(m[1]) > 0) {
        violations.add(
          "Soft shadow detected (blur > 0) — shadows must be hard-offset with zero blur (feOffset + feFlood, no feGaussianBlur).",
        );
        break;
      }
    }
  }

  // ── Gradients ──────────────────────────────────────────────────────────────
  if (opts.maxLinearGradients !== undefined) {
    const count = (svg.match(/<linearGradient/g) ?? []).length;
    if (count > opts.maxLinearGradients) {
      violations.add(
        `${count} linear gradients found — maximum is ${opts.maxLinearGradients}. Use flat fills.`,
      );
    }
  }
  if (opts.allowRadialGradients === false && /<radialGradient/.test(svg)) {
    violations.add("Radial gradients are banned — use flat fills.");
  }

  // ── Text overlap (misaligned duplicate-text shadows, colliding blocks) ────
  if (opts.checkTextOverlap) {
    const texts = estimateTextBoxes(svg);
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const ov = boxOverlap(texts[i], texts[j]);
        const minA = Math.min(boxArea(texts[i]), boxArea(texts[j]));
        if (minA > 0 && ov > 0.3 * minA) {
          violations.add(
            `Text "${texts[i].label}" overlaps text "${texts[j].label}" — every text element needs its own clear space. For text shadows apply the hard-shadow filter to ONE <text> element; never layer duplicate text.`,
          );
        }
      }
    }

    if (opts.canvas) {
      const { w: cw, h: ch } = opts.canvas;

      // Text running off the canvas edge — letters get clipped (e.g. a headline
      // sized so wide the last character is cut off). Only photos and flat
      // colour blocks may bleed; text never may. Slack absorbs estimate noise.
      const slackX = cw * 0.02;
      const slackY = ch * 0.02;
      for (const t of texts) {
        if (
          t.x2 > cw + slackX ||
          t.x1 < -slackX ||
          t.y2 > ch + slackY ||
          t.y1 < -slackY
        ) {
          violations.add(
            `Text "${t.label}" runs off the canvas edge — letters get clipped. Every text element must sit fully inside the ${cw}×${ch} canvas with margin. Shrink the font-size or reposition so no character is cut off; "massive" type must still fit edge-to-edge with padding.`,
          );
        }
      }

      // Small decorative images sitting on text (hero photos are exempt).
      const canvasArea = cw * ch;
      for (const img of imageBoxes(svg)) {
        const imgArea = boxArea(img);
        if (imgArea <= 0 || imgArea > 0.08 * canvasArea) continue;
        for (const t of texts) {
          if (boxOverlap(img, t) > 0.2 * Math.min(imgArea, boxArea(t))) {
            violations.add(
              `A small decorative image overlaps the text "${t.label}" — images must never sit on text. Move it to clear space.`,
            );
            break;
          }
        }
      }

      // Deck slides: a large photo/panel is opaque and drawn last, so text that
      // runs UNDER its edge is silently clipped — the "text overlaps image"
      // failure. Distinguish from an intentional full-bleed overlay (text fully
      // inside a background photo, with a scrim): flag only text that STRADDLES
      // an image edge — meaningfully overlapping yet not mostly contained.
      if (opts.checkImageTextClip) {
        for (const img of imageBoxes(svg)) {
          if (boxArea(img) <= 0.08 * canvasArea) continue; // panels only
          for (const t of texts) {
            const tArea = boxArea(t);
            if (tArea <= 0) continue;
            const frac = boxOverlap(img, t) / tArea;
            if (frac > 0.2 && frac < 0.85) {
              violations.add(
                `Text "${t.label}" overlaps the photo/panel and is clipped where the image covers it — on a slide the image is opaque. Keep the photo and ALL text in separate, non-overlapping zones with a clear gutter: move or shrink the text fully clear of the image. Text may only sit on a photo when it is a full-bleed background with a dark scrim, never a side panel.`,
              );
              break;
            }
          }
        }
      }
    }
  }

  // ── Container hygiene: starbursts, pill overflow/centring, empty panels ───
  if (opts.checkContainers) {
    for (const v of starburstViolations(svg, opts.canvas, opts.starburstAnywhere)) violations.add(v);
    if (opts.canvas) {
      for (const v of containerViolations(svg, opts.canvas)) violations.add(v);
      for (const v of emptyPanelViolations(svg, opts.canvas)) violations.add(v);
      for (const v of occlusionViolations(svg, opts.canvas)) violations.add(v);
    }
  }

  return [...violations];
}
