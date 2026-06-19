// Pixel-level layout validation — rasterises the SVG (resvg, no browser) and
// audits element visibility with sentinel colours. Catches what attribute
// parsing can't: rotated/transformed elements, filled shapes covering text,
// brand marks bleeding off-canvas. The renderer applies transforms for real,
// so there are no blind spots for tilted layouts.
//
// Node-only (native rasteriser + font fetch). Call from "use node" actions
// and treat any throw as "skip" — this layer is best-effort by design; the
// attribute checks and prompt rules still apply underneath it.

import { renderSvg } from "./resvg-render";

type RGB = [number, number, number];

export type PixelMark = { pattern: RegExp; name: string };

export type PixelValidateOptions = {
  canvas: { w: number; h: number };
  /** Brand-mark <image> hrefs and display names (checked for edge padding). */
  marks: PixelMark[];
  /** Min px every brand mark must keep from each canvas edge. Default 36. */
  edgePad?: number;
};

const TOL = 30;            // per-channel sentinel match tolerance
const SCALE = 0.5;         // render at half resolution (±2px accuracy)
const EXPAND = 0.25;       // isolation-render canvas expansion per side
const COVERED_MAX = 0.55;  // visible/expected below this → covered
const CLIP_MIN = 0.985;    // on-canvas/total below this → clipped
const PHOTO_GREY = "#777777";

// ── Sentinel colours: spaced ≥73 per channel, steered clear of brand hues ──
function hexToRgb(hex: string): RGB | null {
  const m = hex.toLowerCase().match(/^#([0-9a-f]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbToHex = (c: RGB) =>
  `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const near = (a: RGB, b: RGB, tol: number) =>
  Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;

function buildSentinels(avoidHex: string[]): RGB[] {
  const avoid = [...avoidHex, PHOTO_GREY, "#000000", "#ffffff", "#0a0a0a"]
    .map(hexToRgb)
    .filter((c): c is RGB => c !== null);
  const steps = [36, 109, 182, 255];
  const out: RGB[] = [];
  for (const r of steps)
    for (const g of steps)
      for (const b of steps) {
        const c: RGB = [r, g, b];
        if (avoid.some((a) => near(a, c, 2 * TOL))) continue;
        out.push(c);
      }
  return out;
}

// ── SVG surgery (string-level; no DOM in the Convex node runtime) ──────────
const stripAttrs = (attrs: string, names: string[]) =>
  names.reduce(
    (a, n) =>
      a
        .replace(new RegExp(`\\s${n}\\s*=\\s*"[^"]*"`, "gi"), "")
        .replace(new RegExp(`\\s${n}\\s*=\\s*'[^']*'`, "gi"), ""),
    attrs,
  );

const numAttr = (attrs: string, name: string): number | null => {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']\\s*(-?[\\d.]+)`));
  return m ? parseFloat(m[1]) : null;
};

function defsRanges(src: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = /<defs[\s\S]*?<\/defs>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push([m.index, m.index + m[0].length]);
  return out;
}

/** transform attrs of the <g> ancestors enclosing position `at`, outermost first. */
function ancestorTransforms(src: string, at: number): string[] {
  const active: Array<string | null> = [];
  const re = /<g\b([^>]*)>|<\/g>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // `>=` (not `>`) so the group whose <g> sits exactly at `at` is excluded —
    // for a plate, `at` is its own group's start and that transform already
    // lives inside the isolated markup, so including it here double-applies it
    // and flings edge badges off-canvas (then they're silently skipped).
    if (m.index >= at) break;
    if (m[0][1] === "/") active.pop();
    else {
      const t =
        m[1].match(/transform\s*=\s*"([^"]*)"/i)?.[1] ??
        m[1].match(/transform\s*=\s*'([^']*)'/i)?.[1] ??
        null;
      active.push(t);
    }
  }
  return active.filter((x): x is string => !!x);
}

const wrapInTransforms = (chain: string[], markup: string) =>
  chain.reduceRight((acc, t) => `<g transform="${t}">${acc}</g>`, markup);

type PaintedEl = {
  kind: "text" | "mark";
  name: string;
  color: RGB;
  isolated: string; // element copy wrapped in its ancestor transform chain
};

/** A plate/pill/badge group: one container shape + the sentinel texts on it. */
type Plate = {
  name: string;
  shape: RGB;
  texts: RGB[];
  isolated: string; // whole group, sentinel-painted, wrapped in ancestors
};

type Painted = { svg: string; defs: string; elements: PaintedEl[]; plates: Plate[] };

/** Spans of innermost <g> groups (no nested <g>) in source order. */
function innermostGroupSpans(src: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  const re = /<g\b[^>]*>|<\/g>/gi;
  const stack: Array<{ start: number; hasChildG: boolean }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[0][1] === "/") {
      const top = stack.pop();
      if (top && !top.hasChildG) out.push({ start: top.start, end: m.index + m[0].length });
      if (stack.length) stack[stack.length - 1].hasChildG = true;
    } else {
      stack.push({ start: m.index, hasChildG: false });
    }
  }
  return out;
}

/**
 * Pair each innermost group's container shape with the sentinel texts inside
 * it (label stickers, plated headlines, badges). The shape gets its own
 * sentinel so centring/overflow can be measured on real pixels — rotation
 * and all. Returns the updated full SVG plus plate records.
 */
function pairPlates(
  painted: string,
  elements: PaintedEl[],
  sentinels: RGB[],
): { svg: string; plates: Plate[] } {
  const textByHex = new Map(
    elements.filter((e) => e.kind === "text").map((e) => [rgbToHex(e.color), e]),
  );
  const plates: Plate[] = [];

  for (const span of innermostGroupSpans(painted)) {
    const seg = painted.slice(span.start, span.end);
    const textCols = [...seg.matchAll(/<text[^>]*fill="(#[0-9a-f]{6})"/gi)]
      .map((m) => m[1].toLowerCase())
      .filter((c) => textByHex.has(c));
    if (textCols.length === 0) continue;
    const shapeM = seg.match(/<(rect|polygon|ellipse|circle)\b[^>]*>/i);
    if (!shapeM || shapeM.index === undefined) continue;
    if (/fill\s*=\s*["']?\s*(none|url)/i.test(shapeM[0])) continue;
    // Each plate is rendered in ISOLATION (see isoSvg(plate.isolated)), so the
    // shape's sentinel only has to differ from THIS plate's own text sentinels —
    // it never needs a globally-unique colour. Picking locally (instead of
    // pulling from the shared pool) means a dense poster can't exhaust the pool
    // and silently skip later badges' centring checks.
    const taken = new Set(textCols);
    const shapeRgb = sentinels.find((s) => !taken.has(rgbToHex(s)));
    if (!shapeRgb) continue;
    const hex = rgbToHex(shapeRgb);
    let tag = shapeM[0].replace(/\sfilter\s*=\s*"[^"]*"/i, "");
    tag = /fill\s*=/.test(tag)
      ? tag.replace(/fill\s*=\s*"[^"]*"/i, `fill="${hex}"`).replace(/fill\s*=\s*'[^']*'/i, `fill="${hex}"`)
      : tag.replace(/^<(\w+)/, `<$1 fill="${hex}"`);

    // Only the isolated render is repainted — the full render keeps the shape's
    // original fill, so reusing a sentinel here can't corrupt another element's
    // visibility measurement elsewhere on the canvas.
    const isolatedSeg = seg.slice(0, shapeM.index) + tag + seg.slice(shapeM.index + shapeM[0].length);
    plates.push({
      name: textByHex.get(textCols[0])!.name,
      shape: shapeRgb,
      texts: textCols.map((c) => hexToRgb(c)!),
      isolated: wrapInTransforms(ancestorTransforms(painted, span.start), isolatedSeg),
    });
  }

  return { svg: painted, plates };
}

/**
 * Repaint the SVG for auditing: every text and brand-mark image gets a unique
 * flat sentinel colour (filters/strokes stripped so the fill is pure); photos
 * become neutral grey rects so they still participate in covering. Each
 * audited element also gets a standalone copy preserving ancestor transforms.
 */
function paintSvg(svg: string, opts: PixelValidateOptions, sentinels: RGB[]): Painted {
  const elements: PaintedEl[] = [];
  let idx = 0;
  const take = (): RGB | null => (idx < sentinels.length ? sentinels[idx++] : null);

  // Texts
  let defs1 = defsRanges(svg);
  let out = svg.replace(
    /<text\b([^>]*)>([\s\S]*?)<\/text>/gi,
    (full, attrs: string, inner: string, offset: number) => {
      if (defs1.some(([s, e]) => offset > s && offset < e)) return full;
      const rgb = take();
      if (!rgb) return full;
      const hex = rgbToHex(rgb);
      const label =
        inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "text";
      const cleanAttrs = stripAttrs(attrs, ["fill", "style", "filter", "opacity", "class", "stroke", "stroke-width"]);
      const cleanInner = inner.replace(/\b(fill|style|class|stroke)\s*=\s*"[^"]*"/gi, "");
      const painted = `<text${cleanAttrs} fill="${hex}" style="fill:${hex}">${cleanInner}</text>`;
      elements.push({
        kind: "text",
        name: label,
        color: rgb,
        isolated: wrapInTransforms(ancestorTransforms(svg, offset), painted),
      });
      return painted;
    },
  );

  // Images → rects (marks get sentinels; photos become grey blockers)
  const afterTexts = out;
  const defs2 = defsRanges(afterTexts);
  out = afterTexts.replace(
    /<image\b([^>]*?)\/?>(?:\s*<\/image>)?/gi,
    (full, attrs: string, offset: number) => {
      if (defs2.some(([s, e]) => offset > s && offset < e)) return full;
      const href =
        attrs.match(/(?:xlink:)?href\s*=\s*"([^"]*)"/i)?.[1] ??
        attrs.match(/(?:xlink:)?href\s*=\s*'([^']*)'/i)?.[1] ??
        "";
      const w = numAttr(attrs, "width");
      if (w === null) return full;
      const mark = opts.marks.find((mk) => mk.pattern.test(href));
      const h = numAttr(attrs, "height") ?? (/logo/.test(href) ? w * 0.3 : w);
      const x = numAttr(attrs, "x") ?? 0;
      const y = numAttr(attrs, "y") ?? 0;
      const transform = attrs.match(/transform\s*=\s*"([^"]*)"/i)?.[1];
      const clip = attrs.match(/clip-path\s*=\s*"([^"]*)"/i)?.[1];
      const extra =
        (transform ? ` transform="${transform}"` : "") + (clip ? ` clip-path="${clip}"` : "");
      if (!mark) {
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PHOTO_GREY}"${extra}/>`;
      }
      const rgb = take();
      if (!rgb) return full;
      const rect = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${rgbToHex(rgb)}"${extra}/>`;
      elements.push({
        kind: "mark",
        name: mark.name,
        color: rgb,
        isolated: wrapInTransforms(ancestorTransforms(afterTexts, offset), rect),
      });
      return rect;
    },
  );

  const defs = (svg.match(/<defs[\s\S]*?<\/defs>/gi) ?? []).join("");
  const paired = pairPlates(out, elements, sentinels);
  return { svg: paired.svg, defs, elements, plates: paired.plates };
}

// ── Rendering + counting ────────────────────────────────────────────────────
const render = renderSvg; // shared resvg renderer (same fonts as export)

/** Pixels per sentinel colour across the whole render. */
function countByColor(
  img: { width: number; height: number; pixels: Buffer },
  colors: RGB[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const px = img.pixels;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    for (const c of colors) {
      if (
        Math.abs(px[i] - c[0]) <= TOL &&
        Math.abs(px[i + 1] - c[1]) <= TOL &&
        Math.abs(px[i + 2] - c[2]) <= TOL
      ) {
        const k = rgbToHex(c);
        counts.set(k, (counts.get(k) ?? 0) + 1);
        break;
      }
    }
  }
  return counts;
}

/** Region split for one sentinel in an expanded isolation render. */
function countRegions(
  img: { width: number; height: number; pixels: Buffer },
  color: RGB,
  canvas: { w: number; h: number },
  pad: number,
) {
  const px = img.pixels;
  const s = img.width / (canvas.w * (1 + 2 * EXPAND)); // px per user unit
  const offX = canvas.w * EXPAND * s;
  const offY = canvas.h * EXPAND * s;
  const cx2 = offX + canvas.w * s;
  const cy2 = offY + canvas.h * s;
  const sx1 = offX + pad * s;
  const sy1 = offY + pad * s;
  const sx2 = cx2 - pad * s;
  const sy2 = cy2 - pad * s;
  let total = 0;
  let inCanvas = 0;
  let inSafe = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    if (
      Math.abs(px[i] - color[0]) > TOL ||
      Math.abs(px[i + 1] - color[1]) > TOL ||
      Math.abs(px[i + 2] - color[2]) > TOL
    )
      continue;
    total++;
    const p = i / 4;
    const x = p % img.width;
    const y = (p / img.width) | 0;
    if (x >= offX && x < cx2 && y >= offY && y < cy2) inCanvas++;
    if (x >= sx1 && x < sx2 && y >= sy1 && y < sy2) inSafe++;
  }
  return { total, inCanvas, inSafe };
}

/** Bbox + centroid of all pixels matching `color`. */
function measureColor(
  img: { width: number; height: number; pixels: Buffer },
  color: RGB,
) {
  const px = img.pixels;
  let count = 0, sx = 0, sy = 0;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    if (
      Math.abs(px[i] - color[0]) > TOL ||
      Math.abs(px[i + 1] - color[1]) > TOL ||
      Math.abs(px[i + 2] - color[2]) > TOL
    )
      continue;
    const p = i / 4;
    const x = p % img.width;
    const y = (p / img.width) | 0;
    count++;
    sx += x;
    sy += y;
    if (x < x1) x1 = x;
    if (y < y1) y1 = y;
    if (x > x2) x2 = x;
    if (y > y2) y2 = y;
  }
  return count
    ? { count, cx: sx / count, cy: sy / count, x1, y1, x2, y2 }
    : null;
}

/** Combined centroid + how many pixels fall outside a given bbox. */
function measureColorsAgainstBox(
  img: { width: number; height: number; pixels: Buffer },
  colors: RGB[],
  box: { x1: number; y1: number; x2: number; y2: number },
) {
  const px = img.pixels;
  let count = 0, sx = 0, sy = 0, outside = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    let hit = false;
    for (const c of colors) {
      if (
        Math.abs(px[i] - c[0]) <= TOL &&
        Math.abs(px[i + 1] - c[1]) <= TOL &&
        Math.abs(px[i + 2] - c[2]) <= TOL
      ) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;
    const p = i / 4;
    const x = p % img.width;
    const y = (p / img.width) | 0;
    count++;
    sx += x;
    sy += y;
    if (x < box.x1 || x > box.x2 || y < box.y1 || y > box.y2) outside++;
  }
  return count ? { count, cx: sx / count, cy: sy / count, outside } : null;
}

// ── Entry point ─────────────────────────────────────────────────────────────
/**
 * Pixel-audit result. `hard` = high-confidence layout failures measured on the
 * real raster (text clipped off the canvas, text/marks fully covered, brand
 * marks bleeding off an edge) — these BLOCK the asset and get the full retry
 * budget. `soft` = lower-confidence nudges (inside the safe margin, pill
 * centring, plate overflow) that ship with a "to eyeball" caveat.
 */
export type PixelResult = { hard: string[]; soft: string[] };

export async function pixelValidate(
  svg: string,
  opts: PixelValidateOptions,
): Promise<PixelResult> {
  const { w: W, h: H } = opts.canvas;
  const pad = opts.edgePad ?? 36;
  const hard: string[] = [];
  const soft: string[] = [];

  // resvg is a strict XML parser: stray "&" (the Google Fonts @import URL)
  // kills the parse and silently disables this whole layer. Escape them, and
  // drop @import rules outright — resvg never fetches remote CSS; fonts come
  // from fontBuffers.
  svg = svg
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
    .replace(/@import\s+url\([^)]*\)\s*;?/gi, "")
    // The film-grain overlay is pure texture (irrelevant to geometry) but an
    // feTurbulence over the whole canvas is expensive — and we render the SVG
    // 20+ times here. Drop the grain rect for validation; keeps every pass fast.
    .replace(/<rect\b[^>]*filter\s*=\s*["']url\(#grain\)["'][^>]*\/?>/gi, "");

  // Sentinels must avoid every colour the design may legitimately contain.
  const usedColors = [...svg.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]);
  const sentinels = buildSentinels(usedColors);
  const painted = paintSvg(svg, opts, sentinels);
  if (painted.elements.length === 0) return { hard, soft };

  // Composite render (normal canvas): what actually survives the z-order.
  const composite = await render(painted.svg, Math.round(W * SCALE));
  const visible = countByColor(
    composite,
    painted.elements.map((e) => e.color),
  );

  // Text safe zone: 5% of the smaller canvas side (globally standard margin).
  const textPad = Math.round(Math.min(W, H) * 0.05);
  const isoSvg = (inner: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-W * EXPAND} ${-H * EXPAND} ${W * (1 + 2 * EXPAND)} ${H * (1 + 2 * EXPAND)}">${painted.defs}${inner}</svg>`;
  const isoWidth = Math.round(W * (1 + 2 * EXPAND) * SCALE);

  // Per-element isolation renders (expanded canvas → off-canvas pixels exist).
  for (const el of painted.elements) {
    const img = await render(isoSvg(el.isolated), isoWidth);
    const elPad = el.kind === "mark" ? pad : textPad;
    const { total, inCanvas, inSafe } = countRegions(img, el.color, opts.canvas, elPad);
    if (total < 12) continue; // too small / failed to draw — nothing to judge

    if (el.kind === "mark" && inSafe / total < 0.995) {
      hard.push(
        `The ${el.name} overhangs or sits too close to the canvas edge — anchor it inside a corner with at least ${pad}px padding on every side (including any rotation). It must never bleed past an edge.`,
      );
    }
    if (el.kind === "text") {
      if (total > 0 && inCanvas / total < CLIP_MIN) {
        hard.push(
          `PIXEL CHECK — the text "${el.name}" runs off the canvas and gets clipped. Reposition or shrink it so every letter sits fully inside the ${W}×${H} canvas with margin.`,
        );
      } else if (inCanvas > 0 && inSafe / inCanvas < 0.97) {
        soft.push(
          `PIXEL CHECK — the text "${el.name}" sits inside the safe margin — keep ALL text at least ${textPad}px from every canvas edge. Move it inward or shrink it.`,
        );
      }
    }
    const vis = visible.get(rgbToHex(el.color)) ?? 0;
    if (inCanvas > 24 && vis / inCanvas < COVERED_MAX) {
      hard.push(
        el.kind === "text"
          ? `PIXEL CHECK — the text "${el.name}" is mostly hidden behind other elements — nothing may sit on top of text. Move the covering shape/photo or relocate the text so it is fully visible.`
          : `PIXEL CHECK — the ${el.name} is mostly hidden behind other elements — brand marks must be fully visible. Move whatever covers it.`,
      );
    }
  }

  // ── Plate audits: text centred on its container + fully inside it ─────────
  for (const plate of painted.plates) {
    const img = await render(isoSvg(plate.isolated), isoWidth);
    const shape = measureColor(img, plate.shape);
    if (!shape || shape.count < 60) continue;
    const text = measureColorsAgainstBox(img, plate.texts, shape);
    if (!text || text.count < 12) continue;

    const shapeW = Math.max(1, shape.x2 - shape.x1);
    const shapeH = Math.max(1, shape.y2 - shape.y1);
    const dx = Math.abs(text.cx - shape.cx) / shapeW;
    const dy = Math.abs(text.cy - shape.cy) / shapeH;
    if (dx > 0.07) {
      soft.push(
        `PIXEL CHECK — the text "${plate.name}" is NOT horizontally centred on its plate/pill — its pixels sit ${Math.round(dx * 100)}% off the container's centre. Centre it exactly (text-anchor="middle" at the shape's centre x).`,
      );
    } else if (dy > 0.1) {
      soft.push(
        `PIXEL CHECK — the text "${plate.name}" is NOT vertically centred on its plate/pill — its pixels sit ${Math.round(dy * 100)}% below/above the container's centre. For a multi-line stack, centre the WHOLE block: put the hero line at the box centre and balance the label above and caption below so the top gap equals the bottom gap (do not stack lines downward from the top).`,
      );
    }
    if (text.outside / text.count > 0.04) {
      soft.push(
        `PIXEL CHECK — the text "${plate.name}" overflows its plate/badge — ${Math.round((text.outside / text.count) * 100)}% of its pixels fall outside the container. Shrink the font or enlarge the plate; keep internal padding ≥0.6× the font-size.`,
      );
    }
  }
  return { hard, soft };
}
