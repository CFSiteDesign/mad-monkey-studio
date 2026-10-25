// Post-generation brand validation — the hard gate, not a suggestion.
// Parses Claude's SVG for off-palette colours, unapproved fonts, soft
// shadows and gradient abuse. Any violation triggers auto-regeneration.

import { FONT_ADVANCES } from "./font-advances";

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
  /** Per-system (e.g. Girly Pop collages): NO text may cross a photo — text
   *  lives on clear background. HARD violation when set. */
  forbidTextOnImages?: boolean;
  /** Per-system (e.g. Minimal Bold): photos must be greyscale — bans the kit's
   *  colour duotone/posterise filters. HARD violation when set. */
  greyscalePhotos?: boolean;
  /** Per-system (Minimal Bold): small text (font-size < 60) may never sit on a
   *  photo — giant headlines cross photos by design, small caps drown. HARD. */
  forbidSmallTextOnImages?: boolean;
  /** Per-system (Minimal Bold): strictly axis-aligned — no rotate/skew/matrix
   *  transform anywhere (a tilted photo also evades every photo check). HARD. */
  forbidRotation?: boolean;
  /** Per-system (Minimal Bold): no emoji / sparkles / dingbats / symbol glyphs
   *  in any text — the page is pure type. HARD. */
  forbidEmoji?: boolean;
  /** Per-system (Minimal Bold): text set in the heavy display face must be
   *  UPPERCASE — no lowercase / script / handwritten headlines. HARD. */
  forbidLowercaseDisplay?: boolean;
  /** Per-system (Minimal Bold): no filled rect / caption-chip / scrim on a
   *  photo — the photo stays clean, labels live on the margins. HARD. */
  forbidRectsOnImages?: boolean;
  /** Per-system (Minimal Bold): a giant headline drawn UNDER a photo (photo on
   *  top → letters clipped/hidden) is a hard failure — draw the photo first. */
  forbidHeadlineBehindImage?: boolean;
  /** Per-system (Minimal Bold): exactly ONE photograph — two stacked photo
   *  bands read as a split/torn image. HARD when 2+ photos present. */
  singlePhoto?: boolean;
  /** Per-system (Minimal Bold): the giant headline is corner-anchored (left or
   *  right), never text-anchor="middle" — centred giant type looks messy. HARD. */
  forbidCenteredDisplay?: boolean;
  /** Per-system (Minimal Bold): no headline "tower" — max 2 tightly-stacked
   *  lines per corner block (BINGO/NIGHT/OR/BUST as one 4-line run is wrong). */
  forbidHeadlineTower?: boolean;
  /** Event templates: at least one real bank photo (or cut-out) must be used. */
  requirePhoto?: boolean;
  /** Event templates (full-bleed photos with measured face bands): skip the
   *  blind "marks stay out of the middle of any photo" rule. */
  photoRequired?: boolean;
  /** Event templates: every fact appears once (HARD). Includes times, days
   *  and dates, which are too short for the phrase check. */
  forbidRepeats?: boolean;
  /** The poster's headline (event title), so a title like "FRIDAY FEELS"
   *  isn't counted as a second mention of the day. */
  headline?: string;
  /** The brief's WHEN line: a year printed on the poster must come from it,
   *  and every day and time in it must be printed (requiredFacts). */
  when?: string;
  /** The brief's PRICE line (requiredFacts). */
  price?: string;
  /** Event templates (HARD): every weekday, time and price the user gave is
   *  on the poster. Templates print a short KEY LINE, which can drop them. */
  requiredFacts?: boolean;
  /** Giant stacked headline (Giant Type, HARD): each Anton headline line fills
   *  `width` x W (portrait) or `landscapeWidth` x W, the whole stack capped at
   *  `maxHeight` x H. Catches timid stacks that leave the poster half empty. */
  stackFill?: { width: number; landscapeWidth: number; maxHeight: number; landscapeMaxHeight?: number };
  /** Event templates (HARD): no line spills off the canvas or past the ends of
   *  the solid bar it sits on, measured with exact per-letter widths. */
  checkTextBounds?: boolean;
  /** 9:16 stories: Instagram UI covers the top/bottom; text + marks must sit
   *  between these y values (HARD). */
  storySafeZone?: { top: number; bottom: number };
  /** Event templates: the analysed bank photos (pixel size, face band,
   *  cut-out). Enables the exact face and cut-out checks below. */
  photoData?: PhotoData[];
  /** No text on the faces of a placed photo (HARD). Needs photoData. */
  textOffFaces?: boolean;
  /** No wordmark on the faces of a placed photo (HARD). Needs photoData. */
  marksOffFaces?: boolean;
  /** Cut-out templates (HARD): use a cut-out when the bank has one; its bottom
   *  runs off the canvas or lands inside a solid shape drawn after it; a side
   *  the photo sliced sits flush with the canvas edge. Needs photoData+canvas. */
  cutoutRules?: boolean;
  /** Stacked lines may not collide, measured with each font's real cap height
   *  (HARD). Catches a squeezed headline pitch the 30%-box estimate misses. */
  checkStackedLines?: boolean;
}

/** What the validator needs to know about a bank photo (fractions 0..1). */
export type PhotoData = {
  url: string;
  width?: number;
  height?: number;
  faceBand?: { y0: number; y1: number; x0?: number; x1?: number };
  cutoutUrl?: string;
  cutoutWidth?: number;
  cutoutHeight?: number;
  cutoutSliced?: string;
};

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
  /** Set by positionedTexts when an ancestor skews the line (its ink box is
   *  then only approximate). */
  skewed?: boolean;
  x: number;
  y: number;
  fontSize: number;
  anchor: "start" | "middle" | "end";
  baseline: string;
  content: string;
  box: Box;
  at: number; // source-order index (for z-order occlusion checks)
  attrs: string; // raw attribute string (for font-weight / font-family checks)
};

/** Fonts that render heavy by design, so text in them counts as "bold" even at
 *  font-weight 400 (Anton/Bungee/Archivo Black/Titan One are single heavy
 *  weights; MMMont600+ are the renamed heavy Montserrat families). */
const HEAVY_FONTS = /Anton|Bungee|Archivo Black|Titan One|Shrikhand|MMMont(?:[6-9]00)|Permanent Marker/i;

/** Is this text element bold? Heavy display face, font-weight:bold, or >= 600. */
function isBoldText(attrs: string): boolean {
  const fam = attrs.match(/font-family\s*[:=]\s*["']?\s*([^"';]+)/i)?.[1] ?? "";
  if (HEAVY_FONTS.test(fam)) return true;
  const fw = (attrs.match(/font-weight\s*[:=]\s*["']?\s*([a-z0-9]+)/i)?.[1] ?? "").toLowerCase();
  if (fw === "bold" || fw === "bolder") return true;
  const n = parseInt(fw, 10);
  return Number.isFinite(n) && n >= 600;
}

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
 * Decorative background type: outline-only (fill="none"), near-transparent
 * (opacity / fill-opacity ≤ 0.35) or explicitly tagged data-deco. Ghost words
 * behind a design are meant to bleed off the edges and sit under everything, so
 * the overlap / edge / covered checks skip them. Attributes must be on the
 * <text> itself.
 */
export function isDecorativeText(attrs: string): boolean {
  if (/\bdata-deco\s*=/i.test(attrs)) return true;
  if (/\bfill\s*=\s*["']\s*none\s*["']/i.test(attrs)) return true;
  for (const a of ["opacity", "fill-opacity"]) {
    const m = attrs.match(new RegExp(`(?:^|\\s)${a}\\s*=\\s*["']\\s*([\\d.]+)`, "i"));
    if (m && parseFloat(m[1]) <= 0.35) return true;
  }
  return false;
}

/**
 * Parse untransformed <text> elements with their raw centring attributes.
 * Width ≈ chars × font-size × 0.6; box height is cap-height-tight so normally
 * line-spaced stacked headlines don't false-positive. Text that is itself
 * transformed, tspan-repositioned, or inside a transformed <g> (local
 * coordinates) is skipped — the prompt rules cover those.
 */
// Anton advance widths per em, measured from the bundled font.
const ANTON_ADV: Record<string, number> = {
  A: 0.485, B: 0.479, C: 0.474, D: 0.493, E: 0.412, F: 0.399, G: 0.485, H: 0.499, I: 0.227,
  J: 0.466, K: 0.472, L: 0.397, M: 0.746, N: 0.498, O: 0.486, P: 0.472, Q: 0.494, R: 0.477,
  S: 0.461, T: 0.396, U: 0.474, V: 0.469, W: 0.712, X: 0.484, Y: 0.446, Z: 0.41, "1": 0.331,
  " ": 0.234, "&": 0.52, "-": 0.311, "'": 0.214, ".": 0.229, "!": 0.229, ",": 0.236, ":": 0.242, "/": 0.405,
};
// Spaces, dots, brackets and other thin glyphs are about half a letter wide;
// counting them as full letters flagged "[SAT . 22 . 08]" as off-canvas.
function genericWidth(content: string): number {
  let n = 0;
  for (const ch of content) n += /[\s.,:;'|!()[\]iIl1\-]/.test(ch) ? 0.5 : 1;
  return n;
}

function antonWidth(content: string): number {
  let w = 0;
  for (const ch of content.toUpperCase()) w += ANTON_ADV[ch] ?? (/[0-9]/.test(ch) ? 0.494 : 0.47);
  return w;
}

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
    if (isDecorativeText(attrs)) continue;
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
    // Wide display faces (Archivo Black) run ~0.7em/char — a 0.6 estimate lets
    // giant headlines clip off-canvas undetected.
    const family = attrs.match(/font-family\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
    const wide = /archivo/i.test(family);
    // Anton is condensed (~0.47em a letter): the generic 0.6 estimate flagged
    // correctly sized giant Anton type as running off the canvas, and the
    // correction shrank it. Measure it letter by letter instead.
    const width = /anton/i.test(family)
      ? antonWidth(content) * fontSize
      : genericWidth(content) * fontSize * (wide ? 0.7 : 0.6);
    const x1 = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
    els.push({
      x, y, fontSize, anchor, baseline, content, at: m.index, attrs,
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

/**
 * Boxes for real (non-mark) photographs, with source-order index. Resolves a
 * translate() so a shifted photo still registers; rotate/skew/matrix photos are
 * skipped here (they're banned outright by forbidRotation, and their AABB is
 * unresolvable). Used by the Minimal-Bold photo-integrity checks.
 */
function photoBoxesResolved(svg: string): Array<{ at: number; box: Box }> {
  const out: Array<{ at: number; box: Box }> = [];
  const re = /<image\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const tag = m[1];
    const href = tag.match(/(?:xlink:)?href\s*=\s*"([^"]+)"/i)?.[1] ?? "";
    if (MARK_HREF.test(href) || href.startsWith("#")) continue;
    const tf = tag.match(/transform\s*=\s*"([^"]*)"/i)?.[1] ?? "";
    if (/rotate|skew|matrix/i.test(tf)) continue;
    const w = numFrom(tag, "width");
    const h = numFrom(tag, "height");
    if (w === null || h === null) continue;
    let x = numFrom(tag, "x") ?? 0;
    let y = numFrom(tag, "y") ?? 0;
    const tr = tf.match(/translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/);
    if (tr) {
      x += parseFloat(tr[1]);
      y += parseFloat(tr[2]);
    }
    out.push({ at: m.index, box: { x1: x, y1: y, x2: x + w, y2: y + h, label: "photo" } });
  }
  return out;
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

      // ── Label must FIT INSIDE the star ──────────────────────────────────
      // The canonical star/sawtooth is a 100-unit-radius shape with valleys
      // around 85 local units; text is safe inside a ~80-unit inner circle.
      // Text + shape share the group's transform, so checking in local units
      // is scale- and rotation-invariant. Estimated width: chars × fs × 0.58.
      const SAFE_R = 80;
      const textRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
      let tm: RegExpExecArray | null;
      while ((tm = textRe.exec(content))) {
        const attrs = tm[1];
        if (/transform\s*=/.test(attrs)) continue; // its own transform — unresolvable
        const label = tm[2].replace(/<[^>]+>/g, "").trim();
        if (!label) continue;
        const fs = numFrom(attrs, "font-size");
        if (fs === null) continue;
        const ty = numFrom(attrs, "y") ?? 0;
        const halfW = label.length * fs * 0.29; // ≈ (chars × fs × 0.58) / 2
        const vert = Math.abs(ty) + fs / 2;
        if (Math.hypot(halfW, vert) > SAFE_R) {
          out.push(
            `Text "${label}" doesn't fit inside its ${dev.sawtooth ? "sawtooth badge" : "starburst"} — every label line must stay within the shape's inner circle (≈${SAFE_R} local units of its 100-unit radius; this line needs ≈${Math.round(Math.hypot(halfW, vert))}). Use at most 2 SHORT lines, shrink the font-size, or shorten the words so nothing pokes past the shape's edge — or scale the whole badge up.`,
          );
        }
      }
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
      // Bold: label text sitting inside a box/pill/badge/card must be bold.
      if (!isBoldText(t.attrs)) {
        out.add(
          `Text "${t.content.slice(0, 28)}" inside a box/pill/badge must be BOLD — set font-weight="700" (or use a heavy display face like Anton/Bungee). Container labels are never thin/regular weight.`,
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

/**
 * Brand marks (ALL IN stickers, stamp, wordmark) must never cover a photo's
 * SUBJECT. Claude can't see pixels, so this is geometric: a mark may touch a
 * photo only in its outer 15% edge band — intruding into the central region
 * (where people are framed) is a violation. Deterministic: resolves the tag's
 * translate() and inflates for rotate(); unresolvable boxes are skipped.
 */
const MARK_HREF = /mm-(?:logo-(?:white|black)|allin(?:-monkey)?|stamp)[^"']*\.png/i;

export function markOverPhotoViolations(svg: string): string[] {
  const out: string[] = [];
  const tags = svg.match(/<image\b[^>]*>/gi) ?? [];

  const marks: { box: Box; label: string }[] = [];
  const photos: Box[] = [];
  for (const tag of tags) {
    const href = tag.match(/(?:xlink:)?href\s*=\s*"([^"]+)"/i)?.[1] ?? "";
    const w = numFrom(tag, "width");
    if (w === null) continue;
    const isMark = MARK_HREF.test(href);
    const h = numFrom(tag, "height") ?? (isMark ? w * 0.35 : null);
    if (h === null) continue;
    let x = numFrom(tag, "x") ?? 0;
    let y = numFrom(tag, "y") ?? 0;
    const tf = tag.match(/transform\s*=\s*"([^"]*)"/i)?.[1] ?? "";
    if (tf) {
      const tr = tf.match(/translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/);
      if (tr) {
        x += parseFloat(tr[1]);
        y += parseFloat(tr[2]);
      }
      // Anything beyond translate+rotate (scale/matrix/nested) → unresolvable.
      if (/scale|matrix|skew/i.test(tf)) continue;
    }
    let box: Box = { x1: x, y1: y, x2: x + w, y2: y + h, label: href };
    if (/rotate\(/i.test(tf)) {
      // A ±15° AABB grows by ≈0.26× the cross dimension — inflate to be safe.
      const dx = h * 0.26, dy = w * 0.26;
      box = { ...box, x1: box.x1 - dx, x2: box.x2 + dx, y1: box.y1 - dy, y2: box.y2 + dy };
    }
    if (isMark) {
      const label = /allin-monkey/i.test(href)
        ? "ALL IN Mad Monkey Hostels sticker"
        : /allin/i.test(href)
        ? "ALL IN sticker"
        : /stamp/i.test(href)
        ? "Mad Monkey stamp"
        : "Mad Monkey wordmark";
      marks.push({ box, label });
    } else if (!href.startsWith("#") && !/^data:/.test(href)) {
      // A real photograph (bank URL or inlined later) — subjects live here.
      photos.push(box);
    }
  }

  for (const { box: m, label } of marks) {
    for (const p of photos) {
      const bandX = (p.x2 - p.x1) * 0.15;
      const bandY = (p.y2 - p.y1) * 0.15;
      const ix1 = p.x1 + bandX, iy1 = p.y1 + bandY, ix2 = p.x2 - bandX, iy2 = p.y2 - bandY;
      if (m.x1 < ix2 && m.x2 > ix1 && m.y1 < iy2 && m.y2 > iy1) {
        out.push(
          `${label} intrudes into the central subject area of a photo — brand marks may only touch a photo's outer 15% edge band (or sit off the photo entirely); never place one across the middle where the people are. Move it to empty background or a photo corner.`,
        );
        break; // one violation per mark is enough signal
      }
    }
  }
  return out;
}

/**
 * Brand marks must never sit ACROSS text (e.g. an ALL IN sticker dropped on a
 * headline). Hard-flagged only when the mark's CENTRE lands inside a text
 * box — blatant coverage — so text-width estimation noise can't misfire it.
 */
export function markOverTextViolations(svg: string): string[] {
  const out: string[] = [];
  const texts = estimateTextBoxes(svg);
  if (!texts.length) return out;
  for (const tag of svg.match(/<image\b[^>]*>/gi) ?? []) {
    const href = tag.match(/(?:xlink:)?href\s*=\s*"([^"]+)"/i)?.[1] ?? "";
    if (!MARK_HREF.test(href)) continue;
    const w = numFrom(tag, "width");
    if (w === null) continue;
    const h = numFrom(tag, "height") ?? w * 0.35;
    let x = numFrom(tag, "x") ?? 0;
    let y = numFrom(tag, "y") ?? 0;
    const tf = tag.match(/transform\s*=\s*"([^"]*)"/i)?.[1] ?? "";
    if (/scale|matrix|skew/i.test(tf)) continue;
    const tr = tf.match(/translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/);
    if (tr) {
      x += parseFloat(tr[1]);
      y += parseFloat(tr[2]);
    }
    const cx = x + w / 2;
    const cy = y + h / 2;
    for (const t of texts) {
      if (cx > t.x1 && cx < t.x2 && cy > t.y1 && cy < t.y2) {
        out.push(
          `A brand mark (${href.split("/").pop()}) sits across the text "${t.label}" — stickers, stamps and the wordmark must be placed in CLEAR space, never across any text. Move the mark to empty background.`,
        );
        break;
      }
    }
  }
  return out;
}

/**
 * Empty photo frame: a WHITE polaroid frame group that carries a caption but
 * no photo inside (e.g. no bank image matched the brief and the frame was left
 * blank). Scoped to white frames so the cream note paper never false-flags.
 */
export function emptyPhotoFrameViolations(svg: string): string[] {
  const out: string[] = [];
  const body = svg.replace(/<defs[\s\S]*?<\/defs>/gi, "");
  const openRe = /<g\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(body))) {
    // Balanced slice for this group.
    let depth = 1;
    let i = openRe.lastIndex;
    while (i < body.length && depth > 0) {
      const no = body.indexOf("<g", i);
      const nc = body.indexOf("</g>", i);
      if (nc === -1) break;
      if (no !== -1 && no < nc) { depth++; i = no + 2; } else { depth--; i = nc + 4; }
    }
    const inner = body.slice(openRe.lastIndex, i - 4);
    // A white frame rect (polaroid), decent size, with a caption, but no photo.
    // Rounded rects (rx>0) are label pills/stickers, not photo frames — skip
    // them, and require a chunky photo-frame footprint (≥220 both ways) so
    // wide-but-short label plates never false-flag as empty polaroids.
    const whiteRect = /<rect\b[^>]*\bfill\s*=\s*["']?\s*(#fff(?:fff)?|white)\b[^>]*>/i;
    const rect = inner.match(whiteRect)?.[0];
    if (!rect) continue;
    const rx = numFrom(rect, "rx");
    if (rx !== null && rx > 0) continue;
    const rw = numFrom(rect, "width");
    const rh = numFrom(rect, "height");
    if (rw === null || rh === null || rw < 220 || rh < 220) continue;
    const hasText = /<text\b/i.test(inner);
    const hasPhoto = /<image\b/i.test(inner);
    if (hasText && !hasPhoto) {
      out.push(
        `An empty polaroid frame (${Math.round(rw)}×${Math.round(rh)}) has a caption but NO photo inside — every white frame must contain a real bank photo. If no photo fits the brief, delete the whole frame and use motifs instead; never leave a blank frame.`,
      );
    }
  }
  return out;
}

// Measured from the bundled fonts (cap height and mean capital advance, per em).
function fontMetrics(attrs: string): { cap: number; adv: number } {
  const fam = (attrs.match(/font-family\s*[:=]\s*["']?\s*([^"';]+)/i)?.[1] ?? "").toLowerCase();
  if (fam.includes("anton")) return { cap: 0.86, adv: 0.48 };
  if (fam.includes("archivo")) return { cap: 0.69, adv: 0.77 };
  if (fam.includes("inter")) return { cap: 0.73, adv: 0.7 };
  if (fam.includes("montserrat")) return { cap: 0.7, adv: 0.74 };
  return { cap: 0.72, adv: 0.65 };
}

type Mat = [number, number, number, number, number, number];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
/** translate / scale / skewX / skewY / matrix; null for rotation or garbage. */
function parseTransform(tf: string): Mat | null {
  let m: Mat = [1, 0, 0, 1, 0, 0];
  const re = /(\w+)\s*\(([^)]*)\)/g;
  let f: RegExpExecArray | null;
  while ((f = re.exec(tf))) {
    const a = f[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (a.some((v) => !Number.isFinite(v))) return null;
    const t = (a[0] ?? 0) * (Math.PI / 180);
    const fn = f[1];
    const n: Mat | null =
      fn === "translate" ? [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]
      : fn === "scale" ? [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]
      : fn === "skewX" ? [1, 0, Math.tan(t), 1, 0, 0]
      : fn === "skewY" ? [1, Math.tan(t), 0, 1, 0, 0]
      : fn === "matrix" && a.length === 6 ? (a as Mat)
      : fn === "rotate" && !(a[0] ?? 0) ? [1, 0, 0, 1, 0, 0]
      : null;
    if (!n || Math.abs(n[1]) > 0.01) return null; // rotation: geometry unknown
    m = mul(m, n);
  }
  return m;
}

/** Every non-decorative <text> with its anchor point and size resolved through
 *  ancestor translate / scale / skew (Big Block's slanted headline group). */
function positionedTexts(svg: string): TextEl[] {
  const body = svg.replace(/<defs[\s\S]*?<\/defs>/gi, (d) => " ".repeat(d.length));
  const out: TextEl[] = [];
  const stack: Array<Mat | null> = [];
  const re = /<(\/?)(g|a|svg)\b([^>]*?)(\/?)>|<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const parent = stack.length ? stack[stack.length - 1] : ([1, 0, 0, 1, 0, 0] as Mat);
    if (m[2]) {
      if (m[1]) stack.pop();
      else if (!m[4]) {
        const tf = m[3].match(/\stransform\s*=\s*"([^"]*)"/i)?.[1];
        const own = tf ? parseTransform(tf) : ([1, 0, 0, 1, 0, 0] as Mat);
        stack.push(parent && own ? mul(parent, own) : null);
      }
      continue;
    }
    const attrs = m[5];
    const inner = m[6];
    if (!parent || isDecorativeText(attrs)) continue;
    if (/<tspan[^>]*\b(?:dy|dx|x|y)\s*=/i.test(inner)) continue;
    const tf = attrs.match(/\stransform\s*=\s*"([^"]*)"/i)?.[1];
    const own = tf ? parseTransform(tf) : ([1, 0, 0, 1, 0, 0] as Mat);
    if (!own) continue;
    const M = mul(parent, own);
    const content = inner.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    if (!content) continue;
    const lx = numFrom(attrs, "x") ?? 0, ly = numFrom(attrs, "y") ?? 0;
    const fs = (numFrom(attrs, "font-size") ?? 16) * Math.abs(M[3]);
    const anchor = (attrs.match(/text-anchor\s*[:=]\s*["']?\s*(middle|end|start)/i)?.[1] ?? "start").toLowerCase() as TextEl["anchor"];
    const baseline = (attrs.match(/dominant-baseline\s*[:=]\s*["']?\s*([a-z-]+)/i)?.[1] ?? "").toLowerCase();
    const x = M[0] * lx + M[2] * ly + M[4];
    const y = M[1] * lx + M[3] * ly + M[5];
    out.push({ x, y, fontSize: fs, anchor, baseline, content, at: m.index, attrs, skewed: Math.abs(M[2]) > 0.01,
      box: { x1: x, y1: y - fs * 0.75, x2: x, y2: y, label: content.slice(0, 28) } });
  }
  return out;
}

/** Advance table for a text's family + weight, if it is a bundled poster face. */
function advanceTable(attrs: string) {
  const fam = (attrs.match(/font-family\s*[:=]\s*["']?\s*([^"';]+)/i)?.[1] ?? "").toLowerCase();
  const wRaw = attrs.match(/font-weight\s*[:=]\s*["']?\s*(\w+)/i)?.[1] ?? "400";
  const weight = wRaw === "bold" ? 700 : parseInt(wRaw, 10) || 400;
  const nearest = (opts: number[]) => opts.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  if (fam.includes("anton")) return FONT_ADVANCES.anton;
  if (fam.includes("archivo")) return FONT_ADVANCES.archivo;
  if (fam.includes("montserrat")) return FONT_ADVANCES[`mont${nearest([400, 600, 700, 800, 900])}`];
  if (fam.includes("inter")) return FONT_ADVANCES[`inter${nearest([400, 600, 900])}`];
  return null;
}

/** Line width in em from the face's real advances (null for unknown faces). */
function lineWidthEm(content: string, attrs: string): number | null {
  const t = advanceTable(attrs);
  if (!t) return null;
  let w = 0;
  for (const ch of content) {
    const i = t.chars.indexOf(ch);
    w += i >= 0 ? t.adv[i] : t.avg;
  }
  return w;
}

/** Ink box of a line of text: cap-height tall, width from the face's advance. */
function inkBox(t: TextEl): Box & { base: number; top: number } {
  const { cap, adv } = fontMetrics(t.attrs);
  const fs = t.fontSize;
  const ls = t.attrs.match(/letter-spacing\s*=\s*"(-?[\d.]+)(em|px)?"/i);
  const spacing = ls ? (ls[2] === "em" ? parseFloat(ls[1]) * fs : parseFloat(ls[1])) : 0;
  const em = lineWidthEm(t.content, t.attrs);
  const width = (em ?? t.content.length * adv) * fs + t.content.length * spacing;
  const x1 = t.anchor === "middle" ? t.x - width / 2 : t.anchor === "end" ? t.x - width : t.x;
  let base = t.y;
  if (/^(central|middle)$/.test(t.baseline)) base = t.y + (cap * fs) / 2;
  else if (/^(hanging|text-before-edge|text-top)$/.test(t.baseline)) base = t.y + cap * fs;
  const top = base - cap * fs;
  return { x1, x2: x1 + width, y1: top, y2: base, base, top, label: t.content.slice(0, 28) };
}

type Placed = { kind: "image" | "rect"; at: number; tag: string; href: string; x: number; y: number; w: number; h: number; known: boolean };

/** <image> and <rect> elements in paint order, with translate() resolved through
 *  their <g> ancestors. `known` is false under any other transform. */
function placedElements(svg: string): Placed[] {
  const out: Placed[] = [];
  const stack: Array<{ dx: number; dy: number; ok: boolean; hidden: boolean }> = [];
  const parseTf = (tag: string) => {
    const tf = tag.match(/\stransform\s*=\s*"([^"]*)"/i)?.[1]?.trim() ?? "";
    if (!tf) return { dx: 0, dy: 0, ok: true };
    const m = tf.match(/^translate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+))?\s*\)$/i);
    return m ? { dx: parseFloat(m[1]), dy: parseFloat(m[2] ?? "0"), ok: true } : { dx: 0, dy: 0, ok: false };
  };
  const re = /<(\/?)(g|a|svg|defs|clipPath|mask|pattern|symbol|marker|image|rect)\b([^>]*?)(\/?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const [tag, closing, rawName, , selfClose] = m;
    const name = rawName.toLowerCase();
    const parent = stack[stack.length - 1] ?? { dx: 0, dy: 0, ok: true, hidden: false };
    if (name === "image" || name === "rect") {
      if (closing || parent.hidden) continue;
      const tf = parseTf(tag);
      const w = numFrom(tag, "width"), h = numFrom(tag, "height");
      if (w === null || h === null) continue;
      out.push({
        kind: name, at: m.index, tag,
        href: tag.match(/(?:xlink:)?href\s*=\s*"([^"]+)"/i)?.[1] ?? "",
        x: (numFrom(tag, "x") ?? 0) + parent.dx + tf.dx,
        y: (numFrom(tag, "y") ?? 0) + parent.dy + tf.dy,
        w, h, known: parent.ok && tf.ok,
      });
      continue;
    }
    if (closing) { stack.pop(); continue; }
    if (selfClose) continue;
    const tf = parseTf(tag);
    const hidden = parent.hidden || /^(defs|clippath|mask|pattern|symbol|marker)$/.test(name);
    stack.push({ dx: parent.dx + tf.dx, dy: parent.dy + tf.dy, ok: parent.ok && tf.ok, hidden });
  }
  return out;
}

/** Where an image's picture actually lands inside its box (preserveAspectRatio). */
function contentRect(p: Placed, natW?: number, natH?: number): Box {
  const box = { x1: p.x, y1: p.y, x2: p.x + p.w, y2: p.y + p.h, label: "image" };
  const par = p.tag.match(/preserveAspectRatio\s*=\s*"([^"]+)"/i)?.[1]?.trim() ?? "xMidYMid meet";
  if (/^none/i.test(par) || !natW || !natH) return box;
  const s = /slice/i.test(par) ? Math.max(p.w / natW, p.h / natH) : Math.min(p.w / natW, p.h / natH);
  const dw = natW * s, dh = natH * s;
  const ax = /xMin/.test(par) ? 0 : /xMax/.test(par) ? 1 : 0.5;
  const ay = /YMin/.test(par) ? 0 : /YMax/.test(par) ? 1 : 0.5;
  const x1 = p.x + (p.w - dw) * ax, y1 = p.y + (p.h - dh) * ay;
  return { x1, y1, x2: x1 + dw, y2: y1 + dh, label: "image" };
}

function intersect(a: Box, b: Box): Box {
  return { x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), x2: Math.min(a.x2, b.x2), y2: Math.min(a.y2, b.y2), label: a.label };
}

const isSolidShape = (tag: string) => {
  const fill = tag.match(/\sfill\s*=\s*"([^"]+)"/i)?.[1]?.trim().toLowerCase() ?? "#000";
  const op = Math.min(numFrom(tag, "opacity") ?? 1, numFrom(tag, "fill-opacity") ?? 1);
  return fill !== "none" && fill !== "transparent" && op >= 0.9;
};

/** Face rectangles (canvas coords) of every placed, analysed photo. */
function placedFaces(placed: Placed[], photos: PhotoData[], canvas?: { w: number; h: number }): Box[] {
  const byUrl = new Map(photos.map((p) => [p.url, p]));
  const out: Box[] = [];
  for (const el of placed) {
    const pd = el.kind === "image" && el.known ? byUrl.get(el.href) : undefined;
    if (!pd?.faceBand || !pd.width || !pd.height) continue;
    const c = contentRect(el, pd.width, pd.height);
    const f = pd.faceBand;
    const cw = c.x2 - c.x1, ch = c.y2 - c.y1;
    const pad = (canvas?.h ?? ch) * 0.015;
    let face: Box = {
      x1: c.x1 + (f.x0 ?? 0) * cw, x2: c.x1 + (f.x1 ?? 1) * cw,
      y1: c.y1 + f.y0 * ch - pad, y2: c.y1 + f.y1 * ch + pad, label: "faces",
    };
    face = intersect(face, { x1: el.x, y1: el.y, x2: el.x + el.w, y2: el.y + el.h, label: "" });
    if (canvas) face = intersect(face, { x1: 0, y1: 0, x2: canvas.w, y2: canvas.h, label: "" });
    if (face.x2 > face.x1 && face.y2 > face.y1) out.push(face);
  }
  return out;
}

/** Weekdays, today/tonight/tomorrow and clock times in a line of text. */
function dayTimeTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const t of text.matchAll(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)\b/g)) tokens.add(`${+t[1]}${t[2] && t[2] !== "00" ? ":" + t[2] : ""}${t[3]}`);
  for (const t of text.matchAll(/\b(MON|TUE|WED|THU|FRI|SAT|SUN)(?:DAY|S|SDAY|NESDAY|R|RS|RSDAY|URDAY)?\b/g)) tokens.add(t[1]);
  for (const t of text.matchAll(/\b(TODAY|TONIGHT|TOMORROW)\b/g)) tokens.add(t[1]);
  return tokens;
}

export function validateSvg(svg: string, opts: ValidateOptions): string[] {
  const violations = new Set<string>();

  // Strip fragment references (url(#id), href="#id") so hex-looking ids
  // like url(#fade) don't false-positive as colours — and strip the injected
  // canonical craft kit (<defs id="mm-kit">): its trusted primitives carry
  // fixed colours (#0a0a0a shadows/grain) that must not fail a design system
  // whose own palette bans them. Claude-authored colours are still scanned.
  const scrubbed = svg
    .replace(/<defs id="mm-kit">[\s\S]*?<\/defs>/i, "<defs/>")
    // Numeric character references (e.g. &#8211; = "–", &#x2013;) — the "#NNNN"
    // otherwise reads as a 4-digit hex colour (&#8211; → #882211). Strip them.
    .replace(/&#x?[0-9a-fA-F]+;/g, " ")
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

  // ── Brand marks over photo subjects / across text (always on — HARD) ─────
  // Full-bleed photo templates know where the faces are (measured bands in the
  // prompt); this blind "middle of the photo" rule would leave no legal spot.
  if (!opts.photoRequired) for (const v of markOverPhotoViolations(svg)) violations.add(v);
  for (const v of markOverTextViolations(svg)) violations.add(v);

  // ── Per-system: photos must be greyscale (Minimal Bold) ──────────────────
  if (opts.greyscalePhotos) {
    if (/url\(\s*#(duo|post)\b/i.test(svg)) {
      violations.add(
        `A photo uses the colour duotone/posterise filter — in this design system photos MUST be greyscale. Apply <feColorMatrix type="saturate" values="0"/> to the <image> instead of filter="url(#duo)" or "url(#post)". No colour anywhere.`,
      );
    }
    // Provable desaturation: every photo must reference a filter whose def
    // actually contains a saturate-0 colour matrix — skipping the filter
    // entirely (a full-colour photo) is a violation too.
    const gsIds = new Set<string>();
    for (const fm of svg.matchAll(/<filter\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/filter>/gi)) {
      const body = fm[2];
      if (/<feColorMatrix\b[^>]*saturate[^>]*>/i.test(body) && /values\s*=\s*["']0(?:\.0*)?["']/i.test(body)) {
        gsIds.add(fm[1]);
      }
    }
    for (const tag of svg.match(/<image\b[^>]*>/gi) ?? []) {
      const href = tag.match(/(?:xlink:)?href\s*=\s*"([^"]+)"/i)?.[1] ?? "";
      if (MARK_HREF.test(href) || href.startsWith("#")) continue;
      const fid = tag.match(/filter\s*=\s*["']url\(#([^)]+)\)/i)?.[1];
      if (!fid || !gsIds.has(fid)) {
        violations.add(
          `A photo is not desaturated — in this design system EVERY photo must be greyscale: define <filter id="gs"><feColorMatrix type="saturate" values="0"/></filter> and put filter="url(#gs)" on every <image>. A full-colour photo is a hard failure.`,
        );
        break;
      }
    }
  }

  // ── Per-system: text never crosses a photo (HARD, e.g. Girly Pop collage) ──
  // Meaningful intrusion only (≥10px depth on both axes) so a caption sitting
  // on a polaroid's white border can't false-flag against the photo itself.
  if (opts.forbidTextOnImages) {
    const markRe = MARK_HREF;
    const photoBoxes: Box[] = [];
    for (const tag of svg.match(/<image\b[^>]*>/gi) ?? []) {
      const href = tag.match(/(?:xlink:)?href\s*=\s*"([^"]+)"/i)?.[1] ?? "";
      if (markRe.test(href) || href.startsWith("#")) continue;
      if (/transform\s*=/i.test(tag)) continue;
      const w = numFrom(tag, "width");
      const h = numFrom(tag, "height");
      if (w === null || h === null) continue;
      const x = numFrom(tag, "x") ?? 0;
      const y = numFrom(tag, "y") ?? 0;
      photoBoxes.push({ x1: x, y1: y, x2: x + w, y2: y + h, label: "photo" });
    }
    const body = svg.replace(/<defs[\s\S]*?<\/defs>/gi, ""); // parseTexts .at indexes into this
    for (const t of parseTexts(svg)) {
      // Plated labels are exempt: text drawn on its own opaque plate/pill
      // (a rect/path earlier in the same group) may legitimately kiss a
      // photo's edge — only RAW text directly over a photo is banned.
      const open = body.lastIndexOf("<g", t.at);
      if (open !== -1) {
        const openEnd = body.indexOf(">", open);
        if (openEnd !== -1 && openEnd < t.at) {
          const between = body.slice(openEnd + 1, t.at);
          if (!between.includes("</g>") && /<rect\b|<path\b/i.test(between)) continue;
        }
      }
      for (const p of photoBoxes) {
        const ix = Math.min(t.box.x2, p.x2) - Math.max(t.box.x1, p.x1);
        const iy = Math.min(t.box.y2, p.y2) - Math.max(t.box.y1, p.y1);
        if (ix > 10 && iy > 10) {
          violations.add(
            `Text "${t.box.label}" crosses a photo — raw text never sits over a photo in this design system. Put it on clear background in its own zone, or give it an opaque plate/pill.`,
          );
          break;
        }
      }
    }
    for (const v of emptyPhotoFrameViolations(svg)) violations.add(v);
  }

  // ── Per-system: SMALL text never sits on a photo (HARD, Minimal Bold) ─────
  if (opts.forbidSmallTextOnImages) {
    const photoBoxes: Box[] = [];
    for (const tag of svg.match(/<image\b[^>]*>/gi) ?? []) {
      const href = tag.match(/(?:xlink:)?href\s*=\s*"([^"]+)"/i)?.[1] ?? "";
      if (MARK_HREF.test(href) || href.startsWith("#")) continue;
      if (/transform\s*=/i.test(tag)) continue;
      const w = numFrom(tag, "width");
      const h = numFrom(tag, "height");
      if (w === null || h === null) continue;
      const x = numFrom(tag, "x") ?? 0;
      const y = numFrom(tag, "y") ?? 0;
      photoBoxes.push({ x1: x, y1: y, x2: x + w, y2: y + h, label: "photo" });
    }
    for (const t of parseTexts(svg)) {
      if (t.fontSize >= 60) continue; // giant display type crosses photos by design
      for (const p of photoBoxes) {
        const ix = Math.min(t.box.x2, p.x2) - Math.max(t.box.x1, p.x1);
        const iy = Math.min(t.box.y2, p.y2) - Math.max(t.box.y1, p.y1);
        if (ix > 10 && iy > 10) {
          violations.add(
            `Small text "${t.box.label}" sits on a photo — small caps/labels are illegible over photography in this design system. Move it onto the black margins (top meta row, bottom meta row, or under the date). Only the giant headline may cross the photo.`,
          );
          break;
        }
      }
    }
  }

  // ── Per-system: strictly axis-aligned — NO rotate/skew/tilt (Minimal Bold) ──
  // A tilted photo also silently evades every photo check above, so this is the
  // keystone rule: everything sits dead straight on the grid.
  if (opts.forbidRotation) {
    const body = svg
      .replace(/<defs id="mm-kit">[\s\S]*?<\/defs>/i, "")
      .replace(/<defs[\s\S]*?<\/defs>/gi, "");
    if (/transform\s*=\s*["'][^"']*(?:rotate|skewX|skewY|matrix)\s*\(/i.test(body)) {
      violations.add(
        `A rotated/tilted/skewed element was found — this design system is strictly axis-aligned. Remove every rotate()/skew()/matrix() transform: the photo, the headline and all caps sit DEAD STRAIGHT on the grid, never tilted or angled. (Only translate/scale are allowed.)`,
      );
    }
  }

  // ── Per-system: no emoji / sparkles / dingbats / symbol glyphs (Minimal Bold)
  if (opts.forbidEmoji) {
    // Arrows, dingbats, misc symbols (incl. ✨ ★ ✦ ❤), stars, variation
    // selectors and the emoji planes. Common punctuation (· – — • ' ") is below
    // U+2190 and stays allowed.
    const EMOJI =
      /[←-⇿⌀-➿⬀-⯿︀-️\u{1F000}-\u{1FAFF}]/u;
    const allText = (svg.match(/<text\b[^>]*>[\s\S]*?<\/text>/gi) ?? [])
      .join(" ")
      .replace(/<[^>]+>/g, " ");
    if (EMOJI.test(allText)) {
      violations.add(
        `Emoji / decorative glyph found in the artwork text — this design system is pure type: NO emoji, sparkles ✨, stars, arrows or symbol characters anywhere. Delete them; the photo does all the visual work.`,
      );
    }
  }

  // ── Per-system: the heavy display headline must be UPPERCASE (Minimal Bold) ──
  if (opts.forbidLowercaseDisplay) {
    for (const m of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
      const fam = m[1].match(/font-family\s*[:=]\s*["']?\s*([^"';]+)/i)?.[1] ?? "";
      if (!HEAVY_FONTS.test(fam)) continue;
      const content = m[2].replace(/<[^>]+>/g, "");
      if (/[a-z]/.test(content.replace(/[^A-Za-z]/g, ""))) {
        violations.add(
          `The display headline "${content.replace(/\s+/g, " ").trim().slice(0, 28)}" has lowercase letters — the giant headline is ALWAYS full UPPERCASE here. Set it in CAPS; never use lowercase, script or handwritten styling for the headline.`,
        );
        break;
      }
    }
  }

  // ── Per-system: no filled rect / caption-chip / scrim on a photo (Minimal Bold)
  if (opts.forbidRectsOnImages) {
    const photos = photoBoxesResolved(svg).map((p) => p.box);
    if (photos.length) {
      const body = svg.replace(/<defs[\s\S]*?<\/defs>/gi, "");
      const gRanges = transformedRanges(body);
      const rectRe = /<rect\b([^>]*)>/gi;
      let rm: RegExpExecArray | null;
      outer: while ((rm = rectRe.exec(body))) {
        const tag = rm[1];
        if (gRanges.some(([s, e]) => rm!.index > s && rm!.index < e)) continue;
        if (/fill\s*=\s*["']?\s*(none|url)/i.test(tag)) continue;
        const fo = tag.match(/fill-opacity\s*=\s*["']?\s*([\d.]+)/i);
        if (fo && parseFloat(fo[1]) === 0) continue;
        const w = numFrom(tag, "width");
        const h = numFrom(tag, "height");
        if (w === null || h === null) continue;
        const x = numFrom(tag, "x") ?? 0;
        const y = numFrom(tag, "y") ?? 0;
        const rect: Box = { x1: x, y1: y, x2: x + w, y2: y + h, label: "rect" };
        for (const p of photos) {
          // A rect that fully CONTAINS the photo is the background/backdrop
          // behind it, not a chip on top — never flag that.
          if (rect.x1 <= p.x1 + 2 && rect.y1 <= p.y1 + 2 && rect.x2 >= p.x2 - 2 && rect.y2 >= p.y2 - 2) continue;
          if (boxOverlap(rect, p) > 0.15 * Math.min(boxArea(rect), boxArea(p))) {
            violations.add(
              `A filled rectangle/box sits on a photo — this design system NEVER puts caption chips, colour blocks or scrims on the photo. Keep the photo completely clean and put every label on the black margins as plain white type.`,
            );
            break outer;
          }
        }
      }
    }
  }

  // ── Per-system: a giant headline must never hide BEHIND the photo (Minimal Bold)
  // Photo drawn AFTER the headline (later in source) = photo on top = letters
  // clipped/hidden (the "BUST behind the photo" failure).
  if (opts.forbidHeadlineBehindImage) {
    const photos = photoBoxesResolved(svg.replace(/<defs[\s\S]*?<\/defs>/gi, ""));
    for (const t of parseTexts(svg)) {
      if (t.fontSize < 60) continue; // only the giant display headline
      const tArea = boxArea(t.box);
      if (tArea <= 0) continue;
      for (const p of photos) {
        if (p.at <= t.at) continue; // photo comes AFTER the text → covers it
        if (boxOverlap(p.box, t.box) > 0.45 * tArea) {
          violations.add(
            `The giant headline "${t.box.label}" is hidden behind the photo (the photo is drawn on top of it, clipping the letters). Draw the <image> FIRST, then the headline over it so the type stays fully visible — or move that headline block onto the clear black margin. The photo must never cover the headline.`,
          );
          break;
        }
      }
    }
  }

  // ── Per-system: exactly ONE photograph — no split/stacked bands (Minimal Bold)
  if (opts.singlePhoto) {
    let photoCount = 0;
    for (const tag of svg.match(/<image\b[^>]*>/gi) ?? []) {
      const href = tag.match(/(?:xlink:)?href\s*=\s*"([^"]+)"/i)?.[1] ?? "";
      if (MARK_HREF.test(href) || href.startsWith("#")) continue;
      photoCount++;
    }
    if (photoCount > 1) {
      violations.add(
        `${photoCount} separate photographs — this design system uses exactly ONE photo as a single full-width band. Two or more photos stacked read as a split/torn image. Keep ONE <image> only; drop the rest.`,
      );
    }
  }

  if (opts.forbidRepeats) {
    // Split each non-decorative text element into its facts (" - ", " / ", " • ")
    // and flag any fact that shows up in two different text elements.
    const seen = new Map<string, number>();
    let idx = 0;
    const body = svg.replace(/<defs[\s\S]*?<\/defs>/gi, "");
    for (const m of body.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
      if (isDecorativeText(m[1])) continue;
      idx++;
      const content = m[2].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().toUpperCase();
      for (const part of content.split(/\s+[-–—\/•·|]\s+/)) {
        const key = part.replace(/[^A-Z0-9$€£฿₱₫₭៛%+&]/g, "");
        if (key.length < 6) continue;
        const prev = seen.get(key);
        if (prev !== undefined && prev !== idx) {
          violations.add(`Repeated fact "${part.trim()}": every fact appears exactly ONCE on the poster. Remove the duplicate.`);
        } else seen.set(key, idx);
      }
    }

    // Times, days and dates: "8PM" in the top row AND in the giant date.
    const headKey = (opts.headline ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const when = new Map<string, string>();
    for (const m of body.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
      if (isDecorativeText(m[1])) continue;
      const content = m[2].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().toUpperCase();
      const flat = content.replace(/[^A-Z0-9]/g, "");
      if (headKey && flat && headKey.includes(flat)) continue;
      const tokens = new Set<string>();
      for (const t of content.matchAll(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)\b/g)) tokens.add(`${+t[1]}${t[2] && t[2] !== "00" ? ":" + t[2] : ""}${t[3]}`);
      for (const t of content.matchAll(/\b(MON|TUE|WED|THU|FRI|SAT|SUN)(?:DAY|S|SDAY|NESDAY|R|RS|RSDAY|URDAY)?\b/g)) tokens.add(t[1]);
      for (const t of content.matchAll(/\b(TODAY|TONIGHT|TOMORROW)\b/g)) tokens.add(t[1]);
      for (const t of content.matchAll(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:UARY|RUARY|CH|IL|E|Y|UST|T|TEMBER|OBER|EMBER)?\.?\s*(\d{1,2})\b/g)) tokens.add(`${t[1]} ${+t[2]}`);
      for (const tok of tokens) {
        const prev = when.get(tok);
        if (prev !== undefined && prev !== content) {
          violations.add(`"${tok}" is printed twice (in "${prev.slice(0, 40)}" and "${content.slice(0, 40)}"): the day, date and time each appear exactly ONCE. Keep them in one element and drop them from the other.`);
        } else when.set(tok, content);
      }
    }

    // A full date (DD . MM . YY) or a 20xx year needs a year in the brief.
    if (opts.when !== undefined && !/\b(19|20)\d{2}\b|'\d{2}\b/.test(opts.when)) {
      for (const m of body.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
        if (isDecorativeText(m[1])) continue;
        const content = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (/\b\d{1,2}\s*[.\/-]\s*\d{1,2}\s*[.\/-]\s*\d{2,4}\b|\b20\d{2}\b/.test(content)) {
          violations.add(`"${content.slice(0, 30)}" prints a year, but the brief's date ("${opts.when.slice(0, 40)}") has none. Never invent a year: write the date without it (e.g. [22 . 08] or [SAT . 22 . 08]).`);
        }
      }
    }
  }

  if (opts.storySafeZone) {
    const { top, bottom } = opts.storySafeZone;
    // Measured ink: capitals only reach the baseline; room below it only for
    // letters that hang (g j p q y, commas).
    for (const t of parseTexts(svg)) {
      const ink = inkBox(t);
      const y1 = ink.top, y2 = ink.base + (/[gjpqy,;]/.test(t.content) ? t.fontSize * 0.22 : 0);
      if (y1 < top || y2 > bottom) {
        violations.add(`Text "${t.content.slice(0, 28)}" sits in Instagram's covered zone: on a 9:16 story keep every text element between y=${top} and y=${bottom}. Move it inside.`);
      }
    }
    for (const tag of svg.match(/<image\b[^>]*>/gi) ?? []) {
      const href = tag.match(/(?:xlink:)?href\s*=\s*"([^"]+)"/i)?.[1] ?? "";
      if (!/mm-logo-(?:white|black)/.test(href) || /transform\s*=/.test(tag)) continue;
      const y = numFrom(tag, "y") ?? 0, h = numFrom(tag, "height") ?? 40;
      if (y < top || y + h > bottom) {
        violations.add(`The Mad Monkey wordmark sits in Instagram's covered zone: on a 9:16 story keep it between y=${top} and y=${bottom}.`);
      }
    }
  }

  // Event templates carry exactly one wordmark (Spotlight's lives in its badge).
  if (opts.photoRequired) {
    const marks = (svg.replace(/<defs[\s\S]*?<\/defs>/gi, "").match(/<image\b[^>]*mm-logo-(?:white|black)[^>]*>/gi) ?? []).length;
    if (marks > 1) {
      violations.add(`${marks} Mad Monkey wordmarks: this template carries exactly ONE. Keep the one the template places and remove the rest.`);
    }
  }

  if (opts.requirePhoto) {
    const hasPhoto = (svg.match(/<image\b[^>]*>/gi) ?? []).some((tag) => {
      const href = tag.match(/(?:xlink:)?href\s*=\s*"([^"]+)"/i)?.[1] ?? "";
      return href !== "" && !MARK_HREF.test(href) && !href.startsWith("#");
    });
    if (!hasPhoto) {
      violations.add(
        `No photo — this style is photo-led and MUST use one real photo from the IMAGE BANK list (exact URL). If nothing shows the event's activity, use a general Mad Monkey vibe photo (a group of young travellers having a great time). Never replace the photo with flat shapes.`,
      );
    }
  }

  // ── Per-system: giant headline is corner-anchored, never centred (Minimal Bold)
  if (opts.forbidCenteredDisplay) {
    for (const t of parseTexts(svg)) {
      const heavy = HEAVY_FONTS.test(t.attrs.match(/font-family\s*[:=]\s*["']?\s*([^"';]+)/i)?.[1] ?? "");
      if ((t.fontSize < 60 && !heavy) || t.anchor !== "middle") continue;
      violations.add(
        `The giant headline "${t.box.label}" is centred (text-anchor="middle") — in this design system the headline is corner-anchored: HALF-1 left-aligned top-left (text-anchor="start") and HALF-2 right-aligned bottom-right (text-anchor="end"). Never centre the big type.`,
      );
      break;
    }
  }

  // ── Per-system: no headline "tower" — max 2 tightly-stacked lines per block ──
  if (opts.forbidHeadlineTower) {
    const giants = parseTexts(svg)
      .filter((t) => {
        const heavy = HEAVY_FONTS.test(t.attrs.match(/font-family\s*[:=]\s*["']?\s*([^"';]+)/i)?.[1] ?? "");
        return t.fontSize >= 60 || heavy;
      })
      .sort((a, b) => a.y - b.y);
    let runStart = 0;
    for (let i = 1; i <= giants.length; i++) {
      const contiguous =
        i < giants.length &&
        giants[i].y - giants[i - 1].y < giants[i - 1].fontSize * 1.5 &&
        Math.abs(giants[i].fontSize - giants[i - 1].fontSize) < giants[i - 1].fontSize * 0.5;
      if (!contiguous) {
        const lines = i - runStart;
        if (lines > 2) {
          violations.add(
            `The headline block "${giants[runStart].box.label}…" is ${lines} tightly-stacked lines — each corner block is at most TWO lines. Split the headline across the top-left and bottom-right corners (2 lines max each); drop filler words rather than towering one corner.`,
          );
          break;
        }
        runStart = i;
      }
    }
  }

  // ── Event templates: exact geometry checks ───────────────────────────────
  if (opts.checkStackedLines) {
    const lines = positionedTexts(svg).map((t) => ({ t, b: inkBox(t) }));
    for (const a of lines) {
      for (const b of lines) {
        if (a === b || b.b.base <= a.b.base) continue;
        const hov = Math.min(a.b.x2, b.b.x2) - Math.max(a.b.x1, b.b.x1);
        if (hov <= 0.2 * Math.min(a.b.x2 - a.b.x1, b.b.x2 - b.b.x1)) continue;
        const intrusion = a.b.base - b.b.top;
        if (intrusion > 0.04 * Math.min(a.t.fontSize, b.t.fontSize)) {
          const pitch = /anton/i.test(b.t.attrs) ? 0.9 : 0.92;
          violations.add(
            `Lines "${a.b.label}" and "${b.b.label}" collide: the lower line's capitals start at y=${Math.round(b.b.top)}, above the upper line's baseline y=${Math.round(a.b.base)}. Each next baseline must sit at least ${pitch} x the LOWER line's font-size below the previous one. Never squeeze the line pitch to fit a space: shrink the font-sizes instead.`,
          );
        }
      }
    }
  }

  if (opts.checkTextBounds && opts.canvas) {
    const { w: W } = opts.canvas;
    const placed = placedElements(svg);
    for (const t of positionedTexts(svg)) {
      if (t.skewed) continue;
      const b = inkBox(t);
      const tw = b.x2 - b.x1;
      if (b.x1 < -0.01 * W || b.x2 > 1.01 * W) {
        violations.add(`Text "${b.label}" spills off the canvas edge (its letters span x ${Math.round(b.x1)}-${Math.round(b.x2)} on a ${W}-wide canvas). Shrink its font-size to about ${Math.floor((t.fontSize * 0.9 * W) / tw)} or split it so every letter fits with margin.`);
        continue;
      }
      const cx = (b.x1 + b.x2) / 2;
      const bar = placed
        .filter((r) => r.kind === "rect" && r.known && r.at < t.at && isSolidShape(r.tag) && r.w < 0.98 * W &&
          r.y <= b.y1 + 1 && r.y + r.h >= b.y2 - 1 && r.x < cx && r.x + r.w > cx)
        .pop();
      if (bar && (b.x1 < bar.x - 0.01 * bar.w || b.x2 > bar.x + bar.w + 0.01 * bar.w)) {
        violations.add(`Text "${b.label}" runs past the ends of the bar it sits on (letters x ${Math.round(b.x1)}-${Math.round(b.x2)}, bar x ${Math.round(bar.x)}-${Math.round(bar.x + bar.w)}). Shrink its font-size to about ${Math.floor((t.fontSize * 0.9 * bar.w) / tw)} so it fits with padding.`);
      }
    }
  }

  if (opts.requiredFacts) {
    const printed = positionedTexts(svg).map((t) => t.content.toUpperCase()).join(" | ");
    const have = dayTimeTokens(printed);
    // The whole event title: "TRIVIA" alone is not "TRIVIA NIGHT".
    const words = new Set(printed.replace(/[^A-Z0-9&' ]/g, " ").split(/\s+/));
    const lost = (opts.headline ?? "").toUpperCase().replace(/[^A-Z0-9&' ]/g, " ").split(/\s+/).filter((w) => w && !words.has(w));
    if (lost.length) {
      violations.add(`The poster leaves out "${lost.join(" ")}" from the event title "${opts.headline}". Print the whole title, every word: shrink it or use more lines rather than cutting words.`);
    }
    for (const tok of dayTimeTokens((opts.when ?? "").toUpperCase())) {
      if (!have.has(tok)) {
        violations.add(`The poster leaves out "${tok}" from the date line ("${(opts.when ?? "").slice(0, 50)}"). Every day and time the user gave must be printed once: add it to the key line, eyebrow or date.`);
      }
    }
    // The whole price, wording included: "₱300 PER TEAM", not just "₱300".
    const flat = (t: string) => t.toUpperCase().replace(/[^A-Z0-9$€£¥฿₱₫₭៛]/g, "");
    const price = flat(opts.price ?? "");
    if (price && !flat(printed).includes(price)) {
      violations.add(`The price "${opts.price}" is missing from the poster or was shortened. Print it once exactly as written (with the details or the key line).`);
    }
  }

  if (opts.stackFill && opts.canvas) {
    const { w: W, h: H } = opts.canvas;
    const headKey = (opts.headline ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const stack = positionedTexts(svg)
      .filter((t) => /anton/i.test(t.attrs))
      .filter((t) => {
        const flat = t.content.toUpperCase().replace(/[^A-Z0-9]/g, "");
        return !headKey || (flat !== "" && headKey.includes(flat));
      })
      .sort((a, b) => a.y - b.y);
    if (stack.length) {
      const fillW = (W > H ? opts.stackFill.landscapeWidth : opts.stackFill.width) * W;
      let target = stack.map((t) => fillW / Math.max(0.5, antonWidth(t.content)));
      const height = target.reduce((sum, fs, i) => sum + (i === 0 ? 0.86 : 0.9) * fs, 0);
      const maxH = (W > H ? opts.stackFill.landscapeMaxHeight ?? opts.stackFill.maxHeight : opts.stackFill.maxHeight) * H;
      if (height > maxH) target = target.map((fs) => (fs * maxH) / height);
      const small = stack.some((t, i) => t.fontSize < 0.82 * target[i]);
      if (small) {
        violations.add(
          `The giant stack is too small: each headline line must fill the width. Use these font-sizes (Anton, measured letter by letter): ${stack.map((t, i) => `"${t.content}" ${Math.round(target[i])}`).join(", ")}. Re-stack them tight (next baseline = previous + 0.9 x the lower line's size) and move the people and small print to fit.`,
        );
      }
    }
  }

  if ((opts.textOffFaces || opts.marksOffFaces || opts.cutoutRules) && opts.photoData?.length) {
    const placed = placedElements(svg);
    const faces = placedFaces(placed, opts.photoData, opts.canvas);
    const faceMsg = (f: Box) => {
      const H = opts.canvas?.h;
      const room = [
        f.y1 > 0 ? `above y=${Math.round(f.y1)}` : "",
        H && f.y2 < H ? `below y=${Math.round(f.y2)}` : "",
      ].filter(Boolean).join(" or ");
      return `(the faces span y ${Math.round(f.y1)}-${Math.round(f.y2)}, x ${Math.round(f.x1)}-${Math.round(f.x2)} on this canvas)${room ? `. Move it ${room}` : ""}`;
    };
    if (opts.textOffFaces) {
      for (const t of parseTexts(svg)) {
        const b = inkBox(t);
        const f = faces.find((f) => boxOverlap(b, f) > 0.1 * boxArea(b));
        if (f) {
          violations.add(
            `Text "${b.label}" sits on people's faces in the photo ${faceMsg(f)}, shrinking the block if it does not fit, or pick a photo whose text-safe band fits it. Text never covers a face.`,
          );
        }
      }
    }
    if (opts.marksOffFaces) {
      for (const el of placed) {
        if (el.kind !== "image" || !el.known || !/mm-logo-(?:white|black)/.test(el.href)) continue;
        const b = { x1: el.x, y1: el.y, x2: el.x + el.w, y2: el.y + el.h, label: "wordmark" };
        const f = faces.find((f) => boxOverlap(b, f) > 0.1 * boxArea(b));
        if (f) violations.add(`The Mad Monkey wordmark sits on people's faces ${faceMsg(f)}, into a corner of empty photo.`);
      }
    }
    if (opts.cutoutRules && opts.canvas) {
      const { w: W, h: H } = opts.canvas;
      const cuts = new Map(opts.photoData.filter((p) => p.cutoutUrl).map((p) => [p.cutoutUrl!, p]));
      const used = placed.filter((el) => el.kind === "image" && cuts.has(el.href));
      if (cuts.size && !used.length) {
        violations.add(
          `No cut-out: in this template the people are a CUTOUT (transparent PNG lifted from a photo) standing in front of the type, and the IMAGE BANK lists ${cuts.size}. Use the CUTOUT url of the best-fitting one (or a general fun group); a plain photo is only the fallback when the bank has no cut-out at all.`,
        );
      }
      for (const el of used) {
        if (!el.known) continue;
        const pd = cuts.get(el.href)!;
        const c = contentRect(el, pd.cutoutWidth, pd.cutoutHeight);
        const cw = c.x2 - c.x1;
        if (c.y2 < H - 2) {
          const landed = placed.some(
            (r) => r.kind === "rect" && r.known && r.at > el.at && isSolidShape(r.tag) &&
              r.y < c.y2 - 2 && r.y + r.h > c.y2 + 1 &&
              r.x <= c.x1 + 0.15 * cw && r.x + r.w >= c.x2 - 0.15 * cw,
          );
          if (!landed) {
            violations.add(
              `The cut-out people end in mid-air at y=${Math.round(c.y2)}: their bottom edge is a hard cut line. It must either run off the bottom of the canvas (picture bottom at y=${H}) or land INSIDE a solid shape drawn AFTER the cut-out (e.g. the details bar: bottom between the bar's top and bottom). With preserveAspectRatio="xMidYMax meet" the picture's bottom is the box's y + height.`,
            );
          }
        }
        // Nothing small sits on the people: the wordmark, small print. Headline
        // lines are meant to sit behind them; text on a bar drawn over them is
        // on the bar.
        const area = (b: Box) => Math.max(1, boxArea(b));
        // On a bar: vertically inside a solid shape drawn after the people, and
        // centred over it (width estimates run long, so not the full width).
        const onBar = (b: Box) =>
          placed.some((r) => r.kind === "rect" && r.known && r.at > el.at && isSolidShape(r.tag) &&
            r.y <= b.y1 + 2 && r.y + r.h >= b.y2 - 2 && r.x < (b.x1 + b.x2) / 2 && r.x + r.w > (b.x1 + b.x2) / 2);
        const headKey = (opts.headline ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        for (const t of parseTexts(svg)) {
          const flat = t.content.toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (headKey && flat && headKey.includes(flat)) continue;
          const b = inkBox(t);
          if (boxOverlap(b, c) > 0.1 * area(b) && !onBar(b)) {
            violations.add(`Text "${b.label}" sits on the cut-out people (their picture spans x ${Math.round(c.x1)}-${Math.round(c.x2)}, y ${Math.round(c.y1)}-${Math.round(c.y2)}). Small text lives on the flat background: move it clear of them.`);
          }
        }
        for (const mk of placed) {
          if (mk.kind !== "image" || !mk.known || !/mm-logo-(?:white|black)/.test(mk.href)) continue;
          const b = { x1: mk.x, y1: mk.y, x2: mk.x + mk.w, y2: mk.y + mk.h, label: "wordmark" };
          if (boxOverlap(b, c) > 0.1 * area(b) && !onBar(b)) {
            violations.add(`The Mad Monkey wordmark sits on the cut-out people (their picture spans x ${Math.round(c.x1)}-${Math.round(c.x2)}, y ${Math.round(c.y1)}-${Math.round(c.y2)}). Put it in a corner of flat background.`);
          }
        }
        // The people stand IN FRONT of the headline: their heads rise into its
        // last line (the Spotlight / Giant Type look), never parked below it.
        if (headKey) {
          const heads = positionedTexts(svg)
            .filter((t) => {
              const flat = t.content.toUpperCase().replace(/[^A-Z0-9]/g, "");
              return flat !== "" && headKey.includes(flat) && t.fontSize >= 0.05 * W;
            })
            .map((t) => ({ t, b: inkBox(t) }))
            .sort((a, b) => b.b.base - a.b.base);
          const last = heads[0];
          if (last) {
            const capH = last.b.base - last.b.top;
            const hov = Math.min(c.x2, last.b.x2) - Math.max(c.x1, last.b.x1);
            const lw = last.b.x2 - last.b.x1;
            // Only ask for what this cut-out can do: grown tall enough to reach
            // the line, a wide picture may need to be wider than the canvas.
            const needTop = last.b.base - 0.45 * last.t.fontSize;
            const aspect = (pd.cutoutWidth ?? 1) / (pd.cutoutHeight ?? 1);
            const reachable = (c.y2 - needTop) * aspect <= 1.4 * W;
            if (c.y1 > last.b.base - 0.25 * capH && reachable) {
              violations.add(
                `The cut-out people must stand IN FRONT of the headline's last line "${last.b.label}": raise the picture so its top sits at y=${Math.round(last.b.base - 0.45 * last.t.fontSize)} or higher (now ${Math.round(c.y1)}), keeping its bottom where the template puts it (make it taller), and draw it after the headline.`,
              );
            }
            if (hov < 0.15 * lw) {
              violations.add(
                `The cut-out people must overlap the headline's last line "${last.b.label}" (x ${Math.round(last.b.x1)}-${Math.round(last.b.x2)}) by at least ${Math.round(0.15 * lw)}px sideways; the picture spans x ${Math.round(c.x1)}-${Math.round(c.x2)}. Move or widen it so the people stand in front of the line's end.`,
              );
            }
          }
        }
        if (pd.cutoutSliced === "left" && c.x1 > 2) {
          violations.add(`This cut-out's people are sliced at its LEFT edge (a straight cut line). Place the picture flush against the canvas's left edge (its left at x=0), not at x=${Math.round(c.x1)}.`);
        }
        if (pd.cutoutSliced === "right" && c.x2 < W - 2) {
          violations.add(`This cut-out's people are sliced at its RIGHT edge (a straight cut line). Place the picture flush against the canvas's right edge (its right at x=${W}), not at x=${Math.round(c.x2)}.`);
        }
      }
    }
  }

  return [...violations];
}
