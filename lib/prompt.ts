import { BRAND_KIT_DOC } from "./brand-kit";

export type FormatSpec = {
  w: number;
  h: number;
  label: string;
  orientation: "square" | "portrait" | "landscape";
  useCase: string;
  /** Composition guidance injected into Claude's system prompt for this format. */
  guidance: string;
};

export const FORMAT_DIMENSIONS: Record<string, FormatSpec> = {
  "1:1": {
    w: 1080,
    h: 1080,
    label: "1080 × 1080 px — Instagram square",
    orientation: "square",
    useCase: "Instagram / Facebook feed post",
    guidance:
      "Balanced, centred composition that works in a busy feed. One dominant focal point; headline and key visual share the centre. Comfortable even margins (~8% of each edge). Avoid important content in the extreme corners.",
  },
  "4:5": {
    w: 1080,
    h: 1350,
    label: "1080 × 1350 px — Instagram portrait",
    orientation: "portrait",
    useCase: "Instagram portrait feed post (max feed real-estate)",
    guidance:
      "Tall feed post that fills more of the screen. Stack content vertically: focal visual upper two-thirds, headline and CTA lower third. Generous top/bottom margins (~7%). Design for vertical reading flow, not a centred square.",
  },
  "9:16": {
    w: 1080,
    h: 1920,
    label: "1080 × 1920 px — Stories / Reels",
    orientation: "portrait",
    useCase: "Instagram / TikTok Stories & Reels (full-screen vertical)",
    guidance:
      "Full-bleed vertical canvas. Keep the focal message in the upper-middle. SAFE ZONES: keep critical text/logo out of the top ~14% (250px) and bottom ~20% (380px) where app UI overlays sit. Big, thumb-stopping type; single idea; high contrast. Compose specifically tall — never centre a square design in the frame.",
  },
  "A4": {
    w: 794,
    h: 1123,
    label: "794 × 1123 px — A4 print at 96 dpi",
    orientation: "portrait",
    useCase: "A4 print / PDF document (flyer, one-pager, report)",
    guidance:
      "Print document layout, not a social graphic. Use clear document structure: header/title band, structured body with readable running text and sections, optional footer. Respect print margins (~60–75px each side). Text can be denser and smaller than social; prioritise legibility and hierarchy over a single hero image.",
  },
  "16:9": {
    w: 1920,
    h: 1080,
    label: "1920 × 1080 px — 16:9 presentation slide",
    orientation: "landscape",
    useCase: "Slide-deck slide (PowerPoint / Keynote, full-bleed)",
    guidance:
      "ONE slide in a deck — landscape 16:9, read at a glance from across a room. Split the canvas: a hero photo or bold colour block fills one side/band, the other carries a left-aligned text column. Calmer than a poster — clear hierarchy, reads in 3 seconds.\n" +
      "ANTI-OVERLAP IS THE #1 RULE FOR DECKS — every text element gets its own horizontal band with a HARD vertical gap to its neighbours of at least 0.5× the LARGER adjacent font-size. Text must NEVER touch or sit over other text.\n" +
      "SIZE THE HEADLINE TO LEAVE ROOM — do NOT fill the height with a giant headline. The whole text column (header + headline + subtitle/bullets) must fit inside the safe area with those gaps. A cover headline is at most 2 lines; if you also have a top eyebrow/header line and a subtitle, the headline font caps around 150–200px so nothing collides. One huge 3-line headline that leaves no room for the header above it is the classic failure — avoid it.\n" +
      "TOP EYEBROW/HEADER: if used, place it in its own band hard against the top margin (~90px) with a clear ≥70px gap before the headline begins — never within a headline's cap-height. Better yet, drop the eyebrow and let the headline lead.\n" +
      "KEEP IT SPARSE: header (optional) + ONE headline + ONE subtitle line OR 2–4 short bullet/stat lines (≥34px) + optional photo band + at most 1–2 small sticker/starburst accents clear of all text. Do not stack header + giant headline + subtitle + pills + stickers all in the same column.\n" +
      "Generous margins (≈90px). Loud brand voice, calm density.",
  },
};

type Palette = { primary: string[]; secondary: string[]; neutral: string[] };
type Fonts   = { display: string; body: string; allowedWeights: number[] };

type BrandConfig = {
  claudeMd: string;
  palette: Palette;
  fonts: Fonts;
  version: number;
};

type DesignSystem = {
  label: string;
  guidelines: string;
} | null | undefined;

export type BankImage = { url: string; description: string };

/** Display faces matched to the real poster styles (all Google Fonts). */
export const DISPLAY_FONTS = ["Montserrat", "Anton", "Archivo Black", "Titan One", "Baloo 2"];

/** Handwritten accents — scribble background layer + "x Partner" credits only. */
export const ACCENT_FONTS = ["Caveat", "Permanent Marker"];

export type BrandMarks = {
  /** Embed the MM wordmark bottom-right. Default true. */
  includeLogo?: boolean;
  /** Embed the ALL IN sticker. Default true. */
  includeAllIn?: boolean;
  /** Embed the ALL IN + monkey-head roundel sticker. Default false. */
  includeAllInMonkey?: boolean;
  /** Embed the round MAD MONKEY HOSTELS stamp/roundel. Default false. */
  includeStamp?: boolean;
};

const PENDING_PREFIX = "PENDING";

export function buildSystemPrompt(
  config: BrandConfig,
  ds: DesignSystem,
  format: string,
  images: BankImage[] = [],
  marks: BrandMarks = {},
  extraColors: string[] = [],
): string {
  const dim = FORMAT_DIMENSIONS[format];
  const allColours = [
    ...config.palette.primary,
    ...config.palette.secondary,
    ...config.palette.neutral,
  ];

  const w = dim?.w ?? 1080;
  const h = dim?.h ?? 1080;

  const sections: string[] = [
    config.claudeMd,
    "",
    BRAND_KIT_DOC,
    `━━ TARGET FORMAT (decide layout BEFORE anything else) ━━`,
    `Format: ${format} — ${dim?.label ?? format}`,
    dim ? `Orientation: ${dim.orientation} (${w} × ${h} px)` : "",
    dim ? `Intended use: ${dim.useCase}` : "",
    dim ? `Composition guidance: ${dim.guidance}` : "",
    `Design the asset FOR this format and aspect ratio. The brief describes WHAT to say; this format dictates HOW it is laid out. Whatever the prompt asks for, it must be composed to fit ${w} × ${h} (${dim?.orientation ?? "square"}) — adapt the layout, type scale and focal placement to these proportions.`,
    "",
  ];

  if (ds && !ds.guidelines.startsWith(PENDING_PREFIX)) {
    sections.push(`━━ DESIGN SYSTEM: ${ds.label.toUpperCase()} ━━`);
    sections.push(ds.guidelines);
    sections.push("");
  } else if (ds) {
    sections.push(`━━ DESIGN SYSTEM: ${ds.label.toUpperCase()} ━━`);
    sections.push(`Apply the ${ds.label} aesthetic: appropriate tone and layout for this context.`);
    sections.push("");
  }

  if (images.length > 0) {
    sections.push(
      `━━ IMAGE BANK (real brand photography) ━━`,
      `These are real Mad Monkey photos. Choose by DESCRIPTION — you cannot see the pixels.`,
      `MATCH THE PHOTO TO THE EVENT'S LITERAL SETTING + ACTIVITY, not to the headline's wordplay. Read the EVENT DETAILS (venue, location, what physically happens) and pick the photo whose scene matches it:`,
      `  • "beach"/"sand"/"shore" event → a photo set on a BEACH or with sand/sea/palms. Do NOT use a pool, foam, rooftop or indoor-bar photo for a beach event.`,
      `  • "beers"/"drinks"/"bar"/"pong" → a photo where people are visibly holding drinks / at a bar / playing beer pong.`,
      `  • "pool"/"foam"/"boat" → only use water/foam/boat photos when the event is actually that.`,
      `The headline may be a pun (e.g. "JUST GOT WETTER") — IGNORE the pun when picking the photo; the photo must depict the real event, not the joke.`,
      ...images.map((img, i) => `${i + 1}. ${img.url}\n   → ${img.description}`),
      `Embedding rules:`,
      `- Use <image href="EXACT_URL_FROM_LIST" x="…" y="…" width="…" height="…" preserveAspectRatio="xMidYMid slice"/>`,
      `- Crop into brand shapes with clipPath (photo cutout device) — irregular polygon or rounded container, thick #0a0a0a border on top.`,
      `- Use ONLY URLs from this list, character-for-character. NEVER invent, modify, or guess an image URL.`,
      `- If no photo matches the event's setting, use flat graphic shapes instead — no image is better than a contradicting one (a foam photo on a beach brief is wrong).`,
      "",
    );
  }

  const includeLogo        = marks.includeLogo        ?? true;
  const includeAllIn       = marks.includeAllIn       ?? true;
  const includeAllInMonkey = marks.includeAllInMonkey ?? false;
  const includeStamp       = marks.includeStamp       ?? false;
  const stickerCount = (includeAllIn ? 1 : 0) + (includeAllInMonkey ? 1 : 0) + (includeStamp ? 1 : 0);
  sections.push(
    `━━ BRAND MARKS FOR THIS ASSET (overrides any conflicting rule above) ━━`,
    includeLogo
      ? `Mad Monkey wordmark: REQUIRED — bottom-right per the logo rules.`
      : `Mad Monkey wordmark: EXCLUDED for this asset — do NOT embed /mm-logo-white.png or /mm-logo-black.png.`,
    includeAllIn
      ? `ALL IN sticker: REQUIRED — embed /mm-allin.png rotated ±5–15°, prominent but clear of the wordmark.`
      : `ALL IN sticker: EXCLUDED for this asset — do NOT embed /mm-allin.png.`,
    includeAllInMonkey
      ? `ALL IN monkey-head sticker: REQUIRED — embed /mm-allin-monkey.png (ALL IN wordmark with the Mad Monkey roundel; black-on-transparent, best on light backgrounds or photos) rotated ±5–15°, clear of the wordmark.`
      : `ALL IN monkey-head sticker: EXCLUDED for this asset — do NOT embed /mm-allin-monkey.png.`,
    includeStamp
      ? `Mad Monkey Stamp: REQUIRED — embed /mm-stamp.png (the round MAD MONKEY HOSTELS roundel stamp; black-on-transparent, reads best on light backgrounds or over a photo) as a circular badge, rotated ±0–10°, clear of the wordmark and all text.`
      : `Mad Monkey Stamp: EXCLUDED for this asset — do NOT embed /mm-stamp.png.`,
    stickerCount >= 2
      ? `${stickerCount} stickers are required: place EACH in a DIFFERENT region of the canvas (e.g. one top-left, one mid-right, one lower-centre), never adjacent, never overlapping each other or anything else.`
      : "",
    includeLogo && stickerCount > 0
      ? `Stickers and the wordmark must NEVER overlap or touch — keep at least 60px between bounding boxes, and keep stickers away from the bottom-right corner.`
      : "",
    (includeLogo || stickerCount > 0)
      ? `EVERY brand mark must sit fully inside the canvas with ≥40px padding from all four edges (x ≥ 40, y ≥ 40, x+width ≤ ${w - 40}, y+height ≤ ${h - 40}). Anchor each toward a corner; its full box including rotation stays on-canvas. NEVER let a mark hang off or touch an edge — the ALL IN Mad Monkey Hostels sticker is large, leave room at the bottom and right.`
      : "",
    "",
  );

  const briefColours = extraColors.filter((c) => !allColours.includes(c));
  sections.push(
    `━━ COLOUR ENFORCEMENT ━━`,
    `Allowed hex values (exact, no others): ${[...allColours, ...briefColours].join("  ")}`,
    `Use 2–3 colours per composition. Every colour used must appear in the list above.`,
    briefColours.length
      ? `The brief explicitly requested ${briefColours.join(", ")} — you MAY use ${briefColours.length > 1 ? "these" : "this"} as ${briefColours.length > 1 ? "exceptions" : "an exception"} where the brief asks for ${briefColours.length > 1 ? "them" : "it"}. Keep every other colour on the brand palette; don't let the exception take over the whole design.`
      : "",
    "",
    `━━ FONT ENFORCEMENT ━━`,
    `Display/headline faces (UPPERCASE, pick the one that fits the mood):`,
    `  • "Anton" — tall condensed impact (default loud headline, e.g. "DEALS?", "HAPPY HOUR")`,
    `  • "Archivo Black" — wide heavy grotesque (chunky stacked headlines, e.g. "BAR OLYMPICS")`,
    `  • "Titan One" — rounded bubble display (playful, e.g. quiz/throwback posters)`,
    `  • "Baloo 2" weight 800 — soft rounded geometric (friendly headlines & pill labels)`,
    `  • "Montserrat" weight 900 — clean geometric fallback`,
    `Body/subtext: "Montserrat" weights 400–600, sentence-case.`,
    `Sticker accent only: "Bungee" — bold sticker-style labels, never headlines or body.`,
    `Handwritten accents: "Permanent Marker" (brushy scribble layer — big background words like "hello"/"hola") and "Caveat" weight 700 (casual script for "Mad Monkey x Partner" credit lines). Accents only — never the main headline or body.`,
    `No other font families permitted. One display face per asset — don't mix headline faces.`,
    "",
    `━━ OUTPUT ━━`,
    `Return ONLY the raw SVG element. No markdown fences. No explanation. No preamble.`,
    `BE ECONOMICAL: define each filter/pattern/clipPath ONCE in <defs> and reuse it; keep decorative paths short; never repeat near-identical elements. The complete SVG must comfortably fit in the response — an SVG cut off before </svg> is rejected outright.`,
    `The SVG MUST be exactly: width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" — and its composition must genuinely use the full ${dim?.orientation ?? "square"} canvas described above.`,
    `EVERY text element must sit FULLY inside the canvas with margin to spare — text touching or crossing the canvas edge is a hard failure. Only photos and flat colour blocks may bleed off the edges. Double-check the y-position + font-size of your lowest text line stays well above ${h}.`,
    `SAFE MARGIN (measured): all text keeps ≥${Math.round(Math.min(w, h) * 0.05)}px clearance from every canvas edge. Container text keeps internal padding ≥0.6× its font-size. Badges/starbursts scale near-uniformly (≤1.25:1 distortion) — never squashed.`,
    `If the brief asks for "massive"/"huge"/"oversized" type, it must STILL fit entirely within the ${w}px width with side margins — size the font so the WIDEST line (≈ longest-word character count × font-size × 0.6) is ≤ ${Math.round(w * 0.92)}px. A big headline that runs off the edge and clips letters is wrong. Drop to two lines or reduce the font-size rather than let any character leave the canvas. "Partially obscured by foreground" means a photo overlaps the text — never that letters spill off the canvas.`,
    `No two text elements may overlap, and nothing may sit on top of text. Text shadows: apply the hard-shadow filter to ONE <text> element — never layer duplicate text. Check every text y-position against its neighbours' font-sizes before finalising.`,
    `Every starburst MUST contain a centred label (short UPPERCASE text or the ALL IN logo) inside the same <g> — never a bare/empty starburst. By DEFAULT starbursts sit in the TOP-RIGHT corner region (centre ≈ 72–88% of width, 8–22% of height) — only an explicit position in the brief overrides this. Never near or over text, wherever placed.`,
    `Never draw an empty rect/panel/box — every panel must contain real content (text or photo) or be removed.`,
    `Filled shapes (pills, blocks, badges, panels) must NEVER be drawn on top of the headline or any text — a shape covering lettering clips it and is a hard failure. Give the headline its own clear zone; place call-out pills in a separate region beside or below it, not overlapping it.`,
    `NEVER LAYER STICKERS. Treat every call-out device as a STICKER: pill labels, speech-bubble tags, rectangular tag boxes (e.g. "THIS FRIDAY", "ULUWATU", "FREE ENTRY"), badges, starbursts, and the ALL IN sticker. Each sticker gets its OWN clear patch of canvas. No sticker's bounding box may intersect another sticker, the headline, the subhead, the wordmark, or any text — keep ≥${Math.round(Math.min(w, h) * 0.03)}px of empty space between every pair of sticker boxes. Stacking two tags in the same spot, or piling tags into the headline's row, is a hard failure.`,
    `The headline band is RESERVED for the headline. Do NOT drop pills, tag boxes or bubbles into the same horizontal strip the big headline occupies — they will collide with the lettering. Scatter call-out stickers into genuinely empty regions of the photo/background (different corners and mid-edges), each rotated slightly and clearly spaced from the next. If there isn't a clear empty patch for a sticker, drop the sticker rather than overlap something.`,
    `BEFORE FINALISING, list every sticker + text block and its bounding box, and confirm no two boxes overlap. Typical count: 2–4 small call-out stickers MAX, spread across the canvas — not a cluster.`,
    `STRICT CENTRING: any text inside a pill, badge, button or starburst MUST use text-anchor="middle" with x at the shape's exact centre AND dominant-baseline="central" with y at the shape's exact centre. Never centre text by guessing the baseline y — that leaves it sitting high or low and will be rejected. It must also fit: text width ≈ chars × font-size × 0.6 ≤ the shape's inner width; otherwise shorten the text or shrink the font. Off-centre text, or text overflowing its container or the canvas, is a hard failure.`,
    `BOLD CONTAINERS: every piece of text sitting inside or on a box, card, pill, tag, badge, button or starburst MUST be BOLD — font-weight="700" (or a heavy display face like Anton/Bungee). Container labels are never thin or regular weight. The text must also sit fully inside the shape with padding on all sides — never touching or spilling past its edges.`,
    `Fonts and the craft-kit filters/patterns/shapes are PRE-LOADED (see CRAFT KIT above) — reference them by id; do NOT emit an @import or redefine kit filters.`,
  );

  return sections.join("\n");
}

/** Strip markdown code fences Claude sometimes adds despite instructions. */
export function stripFences(raw: string): string {
  return raw
    .replace(/^```[\w]*\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}
