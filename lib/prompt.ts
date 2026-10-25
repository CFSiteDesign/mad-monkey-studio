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
  whatsapp: {
    w: 1080,
    h: 1350,
    label: "1080 × 1350 px — WhatsApp chat image",
    orientation: "portrait",
    useCase: "WhatsApp group / broadcast message image (shown in full inside the chat bubble, read at thumbnail size)",
    guidance:
      "This image is read inside a WhatsApp chat bubble about 330px wide, often without being opened, and WhatsApp re-compresses it. Design for THUMBNAIL legibility: ONE short headline at least 1/6 of the canvas height, then the facts (when · where · price) in 2–3 lines at ≥48px, one CTA line, nothing else. No fine print, no small stickers, no thin outlines or hairline details (compression eats them). Extra-high contrast: solid colour fields, big flat shapes, one bold photo block at most. Generous margins (~8%) so nothing sits under the bubble's rounded corners. The wordmark stays small but clear. If it is not readable at a quarter of its size, it is wrong.",
  },
  "whatsapp-landscape": {
    w: 1600,
    h: 1052,
    label: "1600 × 1052 px — WhatsApp landscape image",
    orientation: "landscape",
    useCase: "WhatsApp group / broadcast message image, landscape (fills the chat bubble width, read at thumbnail size)",
    guidance:
      "Wide banner read inside a WhatsApp chat bubble about 330px wide, often without being opened, and re-compressed by WhatsApp. Split the canvas into two side-by-side zones: a bold photo or colour block on one side, the text column on the other (never text across the whole width). ONE short headline at least 1/5 of the canvas height, then the facts (when · where · price) in 2–3 lines at ≥52px, one CTA line, nothing else. No fine print, no small stickers, no hairline details. Extra-high contrast, solid colour fields. Generous margins (~6%) so nothing sits under the bubble's rounded corners. If it is not readable at a quarter of its size, it is wrong.",
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
  // Per-system governance overrides — when present they REPLACE the brand
  // defaults (palette hexes in the prompt, the FONT ENFORCEMENT block).
  palette?: Palette | null;
  fontRules?: string | null;
  effects?: { ownStyle?: boolean; photoRequired?: boolean; useCutouts?: boolean } | null;
} | null | undefined;

/** A bank photo as the model sees it. Analysis fields (normalised 0..1) are
 *  present when the photo has been analysed (scripts/analyze-bank or upload). */
export type BankImage = {
  url: string;
  description: string;
  width?: number;
  height?: number;
  subjectBox?: { x0: number; y0: number; x1: number; y1: number };
  faceBand?: { y0: number; y1: number; x0?: number; x1?: number };
  cutoutUrl?: string;
  cutoutWidth?: number;
  cutoutHeight?: number;
  cutoutSliced?: string;
  hasText?: boolean;
};

// Brand-doc sections that are governance (kept for "own style" templates). The
// rest — SHADOWS, COMPOSITION, BRAND DEVICES, TYPOGRAPHY recipes, PHOTO
// TREATMENTS, TEXTURE, BANNED, LAYOUT HYGIENE's photo rules — is the house
// sticker-collage recipe, which a template's own guidelines replace.
const GOVERNANCE_SECTIONS = /^(COLOURS|GLOBAL LAYOUT PRINCIPLES|LOGO|VOICE|OUTPUT)\b/;

/** The brand doc cut to governance: intro + the GOVERNANCE_SECTIONS blocks. */
export function governanceOnly(doc: string): string {
  return doc
    .split(/(?=━━ [^━]+ ━━)/)
    .filter((part, i) => {
      if (i === 0) return true;
      const m = part.match(/^━━ ([^━]+?) ━━/);
      return m ? GOVERNANCE_SECTIONS.test(m[1].trim()) : false;
    })
    .join("")
    .trim();
}

const pct = (v: number) => Math.round(Math.max(0, Math.min(100, v)));

/**
 * Exact full-bleed geometry for a photo on a W×H canvas, framed so the FACES
 * stay in view (horizontally centred on them; vertically choosing the position
 * that leaves the biggest face-free band for text), plus where the faces and
 * subject land in canvas %. Returns null when the photo hasn't been analysed.
 */
export function fullBleedHint(img: BankImage, W: number, H: number): string | null {
  if (!img.width || !img.height) return null;
  const s = Math.max(W / img.width, H / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  const faces = img.faceBand;
  const subj = img.subjectBox;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  // Horizontal: centre the faces (else the subject) when the photo is wider.
  let ox = (W - dw) / 2;
  if (dw - W > 1) {
    const fx =
      faces?.x0 != null && faces?.x1 != null
        ? (faces.x0 + faces.x1) / 2
        : subj
          ? (subj.x0 + subj.x1) / 2
          : 0.5;
    ox = clamp(W / 2 - fx * dw, W - dw, 0);
  }
  // Vertical: of top / middle / bottom, keep faces in and maximise free space.
  let oy = (H - dh) / 2;
  if (dh - H > 1) {
    const options = [0, (H - dh) / 2, H - dh];
    const score = (o: number) => {
      const my = (y: number) => ((o + y * dh) / H) * 100;
      if (faces) {
        const f0 = my(faces.y0), f1 = my(faces.y1);
        return Math.max(f0 - 4, 100 - (f1 + 4)) - (f0 < -1 || f1 > 101 ? 1000 : 0);
      }
      return subj ? -Math.abs(my((subj.y0 + subj.y1) / 2) - 55) : 0;
    };
    oy = options.sort((a, b) => score(b) - score(a))[0];
  }
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const my = (y: number) => ((oy + y * dh) / H) * 100;
  const mx = (x: number) => ((ox + x * dw) / W) * 100;
  const parts = [
    `full-bleed: x="${r1(ox)}" y="${r1(oy)}" width="${r1(dw)}" height="${r1(dh)}" preserveAspectRatio="none"`,
  ];
  if (subj) parts.push(`subject x ${pct(mx(subj.x0))}–${pct(mx(subj.x1))}%, y ${pct(my(subj.y0))}–${pct(my(subj.y1))}%`);
  if (faces) {
    const f0 = pct(my(faces.y0)), f1 = pct(my(faces.y1));
    const fx = faces.x0 != null && faces.x1 != null ? `, x ${pct(mx(faces.x0))}–${pct(mx(faces.x1))}%` : "";
    parts.push(`FACES y ${f0}–${f1}%${fx}`);
    const bands: string[] = [];
    if (f0 - 4 >= 18) bands.push(`top y 0–${f0 - 4}%`);
    if (100 - (f1 + 4) >= 18) bands.push(`bottom y ${f1 + 4}–100%`);
    parts.push(bands.length ? `text-safe: ${bands.join(", ")}` : `no face-free band: needs a scrim`);
  } else {
    parts.push(`no faces detected`);
  }
  return parts.join("; ");
}

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
  // A design system with its own palette replaces the brand colours outright.
  const pal = ds?.palette ?? config.palette;
  const allColours = [...pal.primary, ...pal.secondary, ...pal.neutral];

  const w = dim?.w ?? 1080;
  const h = dim?.h ?? 1080;

  // "Own style" templates keep the brand's governance but not its house recipe.
  const brandDoc = ds?.effects?.ownStyle ? governanceOnly(config.claudeMd) : config.claudeMd;
  const photoLed = Boolean(ds?.effects?.photoRequired);
  const useCutouts = Boolean(ds?.effects?.useCutouts);

  const sections: string[] = [
    brandDoc,
    "",
    BRAND_KIT_DOC,
    `━━ TARGET FORMAT (decide layout BEFORE anything else) ━━`,
    `Format: ${format} — ${dim?.label ?? format}`,
    dim ? `Orientation: ${dim.orientation} (${w} × ${h} px)` : "",
    dim ? `Intended use: ${dim.useCase}` : "",
    dim ? `Composition guidance: ${dim.guidance}` : "",
    `Design the asset FOR this format and aspect ratio. The brief describes WHAT to say; this format dictates HOW it is laid out. Whatever the prompt asks for, it must be composed to fit ${w} × ${h} (${dim?.orientation ?? "square"}) — adapt the layout, type scale and focal placement to these proportions.`,
    "",
    `━━ COPY INTEGRITY (do not make things up) ━━`,
    `Use ONLY the words and facts the brief provides. NEVER invent or add a factual claim that wasn't given — no prices, times, dates, perks, statistics, AND no place-specific details (scenery/geography like "limestone cliffs" or "white-sand beaches", landmarks, distances, "famous for…", named attractions, history, weather). You may add brand energy and short vibe words (e.g. "ALL IN", "BIG NIGHT", "LET'S GO"), but never present an invented specific as if it were a real fact about the location or event.`,
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

  if (images.length > 0 && photoLed) {
    sections.push(
      `━━ IMAGE BANK (real brand photography) — THIS STYLE IS PHOTO-LED ━━`,
      `Every design in this style uses ONE real photo from this list. Never replace it with flat shapes, never invent a URL. Choose by DESCRIPTION — you cannot see the pixels:`,
      `1. FIRST CHOICE: a photo of THIS event's literal activity or setting (bicycle tour → people on bikes; river/boat cruise → people ON a boat or deck; karaoke or club night → a bar/club night crowd; beer pong → a drinking game; beach event → the beach; pool party → the pool).`,
      `   NEVER pick a photo whose activity contradicts the event: an underwater dive is not a cruise, a pool is not a beach, a daytime beach is not a club night, a food plate is not a party.`,
      `   ACTIVITY BEATS MOOD: the literal activity or setting outranks time of day and lighting. A boat cruise uses a boat or deck photo even if it is daytime; a bike tour uses bikes even without a sunset. The brief's PHOTO line says what to look for.`,
      `2. If no photo shows that activity, use a GENERAL MAD MONKEY VIBE photo: a group of young travellers clearly having a great time (party crowd, bar night, pool or beach group), matching the event's time of day where possible (night event → night/bar/club shot; daytime trip → daylight outdoor group).`,
      `3. NEVER use: food or drink close-ups, product shots (cans, bottles, syringes), menus, flyers, posters, maps, diagrams or flowcharts, empty landscapes, or staff/reception line-ups, unless the event is literally about that thing (a food night may use a food shot).`,
      `The headline may be a pun: pick by the real activity, never the joke.`,
      `Per-photo layout data (when shown) is MEASURED from the pixels for THIS ${w}×${h} canvas: for a full-bleed photo copy the given x / y / width / height / preserveAspectRatio EXACTLY (they frame the faces), and keep every text block inside a "text-safe" band. Text must NEVER sit across the FACES band.`,
      ...images.map((img, i) => {
        const hint = fullBleedHint(img, w, h);
        const cut =
          useCutouts && img.cutoutUrl
            ? `\n   CUTOUT (people lifted out, transparent PNG, ${img.cutoutWidth ?? "?"}×${img.cutoutHeight ?? "?"} px${img.cutoutSliced ? `, people cut off at its ${img.cutoutSliced.toUpperCase()} edge: place it flush against the poster's ${img.cutoutSliced} edge` : ""}): ${img.cutoutUrl}`
            : "";
        const words = img.hasText ? `\n   [HAS PRINTED WORDS in the picture: never use it as a background]` : "";
        return `${i + 1}. ${img.url}\n   → ${img.description}${words}${hint ? `\n   [${hint}]` : ""}${cut}`;
      }),
      `Embedding rules:`,
      `- Full-bleed photo: <image href="EXACT_URL_FROM_LIST" …/> with the exact x / y / width / height / preserveAspectRatio given in that photo's [full-bleed: …] data. For a photo without layout data use x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice".`,
      useCutouts
        ? `- A CUTOUT url is a transparent PNG of the photo's people: place it with preserveAspectRatio="xMidYMax meet" and a width/height in the listed aspect ratio. Only use a cutout URL exactly as listed; photos without a CUTOUT line have none.`
        : "",
      `- Use ONLY URLs from this list, character-for-character. NEVER invent, modify, or guess an image URL.`,
      "",
    );
  } else if (images.length > 0) {
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
    (includeLogo || stickerCount > 0)
      ? `MARKS NEVER COVER PHOTO SUBJECTS (hard rule, geometrically enforced): you cannot see the pixels, and the people are framed in the MIDDLE of every photo — so no sticker, stamp or wordmark may intrude into a photo's central region. A mark may only touch a photo within its outer 15% edge band (a corner nibble), and the best placement is off the photo entirely, on empty background. A sticker across someone's face or body is an automatic rejection.`
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
    ...(ds?.fontRules
      ? [ds.fontRules, `No other font families permitted.`]
      : [
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
        ]),
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
    `STARBURST LABELS FIT THE STAR (geometrically enforced): the star is 100 local units in radius and text is only safe inside a ~80-unit inner circle — every line must satisfy √((chars × font-size × 0.29)² + (|y| + font-size/2)²) ≤ 80 in the star's local coordinates. Practically: at most 2 SHORT lines (e.g. "FREE" / "ENTRY"), font-size ≈ 26–32 for words of 4–6 characters, smaller if longer. A third line or a long word WILL poke past the points and be rejected — put overflow copy in a pill instead, or scale the whole starburst group up.`,
    `BOLD CONTAINERS: every piece of text sitting inside or on a box, card, pill, tag, badge, button or starburst MUST be BOLD — font-weight="700" (or a heavy display face like Anton/Bungee). Container labels are never thin or regular weight. The text must also sit fully inside the shape with padding on all sides — never touching or spilling past its edges.`,
    `Fonts and the craft-kit filters/patterns/shapes are PRE-LOADED (see CRAFT KIT above) — reference them by id; do NOT emit an @import or redefine kit filters.`,
  );

  return sections.join("\n");
}

/** Strip markdown code fences Claude sometimes adds despite instructions. */
/**
 * The SVG document from a model reply. Opus 5.5 sometimes writes its layout
 * notes as plain text before the SVG ("Line1 width: 33 chars at 35 → ~1020 …
 * </reasoning><svg …"); browsers shrug that off but the export renderer
 * refuses the file. Keep only the root <svg …xmlns…> through the last </svg>.
 */
export function extractSvg(raw: string): string {
  const text = stripFences(raw);
  const root = text.search(/<svg\b[^>]*\bxmlns\s*=/i);
  const start = root >= 0 ? root : text.search(/<svg\b/i);
  const end = text.lastIndexOf("</svg>");
  if (start < 0 || end < start) return text;
  return text.slice(start, end + "</svg>".length);
}

export function stripFences(raw: string): string {
  return raw
    .replace(/^```[\w]*\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}
