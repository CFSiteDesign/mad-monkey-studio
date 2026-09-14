// Template-driven generation: Claude is shown the reference design as an IMAGE
// (vision) and told to reproduce its layout for the new event details, inside
// brand governance. This is what makes "pick a template" produce Claude-Design
// quality: the model sees the real composition instead of a description of it.

export type ReferenceImage = {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
};

export function toMediaType(contentType: string | null | undefined): ReferenceImage["mediaType"] {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "image/jpeg";
  if (ct.includes("gif")) return "image/gif";
  if (ct.includes("webp")) return "image/webp";
  return "image/png";
}

/** The user-turn text that accompanies the reference image. */
export function replicationBrief(opts: {
  templateName: string;
  format: string;
  brief: string;
  layoutSpec?: string | null;
  referenceText?: string[] | null;
  /** The reference's own canvas, when the user asked for a different size. */
  nativeFormat?: string | null;
}): string {
  const { templateName, format, brief, layoutSpec, referenceText, nativeFormat } = opts;
  // Only DISTINCTIVE WORDS are placeholders. Never list prices, times, dates or
  // generic labels ("ONLY", "PER PERSON"): telling the model "never write $100"
  // measurably nudged it into writing $5 instead of the brief's $25.
  const GENERIC = /^(only|per person|free|entry|every|from|pm|am|the|and|with|at|to|of|all in|mad monkey|mad monkey hostels)$/i;
  const placeholders = (referenceText ?? [])
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && /[a-z]{3,}/i.test(w) && !/^[\s$€£\d.,:%&'-]+$/.test(w) && !GENERIC.test(w));
  return [
    `STYLE REFERENCE ATTACHED (template "${templateName}"). It is inspiration, not a stencil: borrow its attitude, composition rhythm, type scale, colour logic and decorative language, then design an ORIGINAL Mad Monkey poster for the NEW event below. Nobody should be able to say it was traced; everybody should see the family resemblance.`,
    ``,
    `NEW EVENT DETAILS (the ONLY text allowed on the design comes from here):`,
    brief.trim(),
    ``,
    `TAKE FROM THE REFERENCE`,
    `• Composition: where the weight sits (headline zone, hero zone, detail zone), the sense of scale, the negative space. Same zones, freely re-proportioned for this canvas.`,
    `• Type attitude: heavy / condensed / stacked / repeated / outlined / wobbly, uppercase or not, one dominant word or a block. Set it in the closest APPROVED font.`,
    `• Colour logic: dark ground or light ground, one accent or two, duotone photos or full colour. Map every colour to the closest APPROVED palette colour; never copy an off-brand hex.`,
    `• Devices: repeated headline rows, starburst or oval frames, badges, barcodes, grids, chevrons, sparkles, torn edges, halftone. Reuse the KIND of device, built from the craft kit, placed where this design needs it. Nothing the reference would not have.`,
    `• Glows, auras, blurs and gradients are NOT available (the validator rejects them). Render a glow or aura as flat concentric shapes, a halftone-dot burst or a solid colour field in palette colours; render soft edges as hard cut-outs.`,
    ``,
    `REAL PHOTOGRAPHY IS MANDATORY`,
    `• Use at least ONE real photo from the IMAGE BANK as the hero. Pick by description: the scene must match the event's setting and activity. Hostel marketing runs on real people having a real time.`,
    `• Where the reference has an illustration, mascot, silhouette, aura figure, product shot or 3D object, put a bank PHOTO in that slot with a matching treatment: palette duotone or monochrome tint, halftone, hard cut-out, oval / circle / arch / starburst mask, thick outline. NEVER draw people, mascots, silhouettes or blobs as a stand-in for a photo.`,
    `• If the reference is pure typography with no imagery, you may keep it type-only or add one framed photo; type-only must then be immaculate.`,
    `• Photos are large and confident, never thumbnails. Text sits on a plate, a duotone or clear background, never on a busy part of a photo.`,
    ``,
    `WRITE FOR THE EVENT`,
    `• The headline slot shows the NEW event's name (the first thing in the details), in the reference's headline style. Never keep or echo the reference's words.`,
    `• NUMBERS ARE SACRED: every price, time and date appears EXACTLY as given ($25 stays $25, never $5 or "25"; 4:30pm stays 4:30pm). Enlarge the badge or shrink the font, never shorten a number.`,
    `• Keep copy lean: headline, at most one hook line, the facts (when, where, price, one inclusion), one call to action. No filler. Separate details with a middle dot (·) or line breaks, never dashes.`,
    placeholders.length
      ? `• Reference text you must NOT reuse anywhere: ${placeholders.map((w) => `"${w}"`).join(", ")}. If any of these words are not in the event details, they must not appear.`
      : `• Do not reuse any word or phrase you can read in the reference image unless it also appears in the event details.`,
    ``,
    `QUALITY BAR (it has to look like a designer made it)`,
    `• ONE clear hero (the headline or the photo), one secondary element, everything else quiet. At most three type sizes.`,
    `• Everything on a grid: consistent margins, aligned edges, deliberate spacing. Nothing touches anything by accident; badges only in genuinely empty space, and only if the reference's style has them.`,
    `• NOTHING OVERLAPS THE HEADLINE: no pill, badge, sticker, photo edge or logo may touch the headline's letters. Pills and badges live in empty margins or corners, never on top of type or on a face.`,
    `• Text is never hidden: no text under a photo, a shape or another text block. If a line does not fit, move it or shrink it; never let it tuck behind something.`,
    `• Whitespace is a feature. Fewer, bigger, better.`,
    layoutSpec?.trim()
      ? `\nSTRUCTURAL READ OF THE REFERENCE (guidance for zones and proportions, not a tracing map):\n${layoutSpec.trim()}`
      : "",
    nativeFormat && nativeFormat !== format
      ? `\nSIZE: the reference is ${nativeFormat}; this canvas is ${format}. Keep the same zones, order and hierarchy and re-flow them to the new proportions. Never distort, letterbox or leave empty bands.`
      : "",
    ``,
    `Canvas: ${format}. Output the complete SVG only.`,
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

/**
 * Distinctive reference phrases that reappeared in a replica — the model kept
 * the placeholder words instead of swapping in the new event. Lines that are in
 * the new brief (or too generic/short to be distinctive) are ignored.
 */
export function copiedReferenceText(
  svg: string,
  referenceText: string[] | null | undefined,
  brief: string,
): string[] {
  if (!referenceText?.length) return [];
  const norm = (t: string) =>
    t.replace(/&amp;/g, "&").replace(/[^a-z0-9$&' ]/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const out = norm(svg.replace(/<[^>]+>/g, " "));
  const b = norm(brief);
  const GENERIC = /^(only|per person|free|entry|every|from|pm|am|the|and|with|at|to|of|all in|mad monkey|mad monkey hostels)$/;
  const hits: string[] = [];
  for (const line of referenceText) {
    const n = norm(line);
    if (n.length < 4 || GENERIC.test(n) || b.includes(n)) continue;
    if (!/[a-z]{3,}/.test(n)) continue; // prices / times / dates are never "copied copy"
    if (out.includes(n)) hits.push(line.trim());
  }
  return [...new Set(hits)];
}

/**
 * Prices and clock times stated in the brief that are missing from the output.
 * A template replica must carry the facts verbatim — a retry that "fits" $25
 * into a badge by writing $5 ships a wrong poster.
 */
export function missingBriefFacts(svg: string, brief: string): string[] {
  const squash = (t: string) => t.replace(/&amp;/g, "&").replace(/\s+/g, "").toLowerCase();
  const out = squash(svg.replace(/<[^>]+>/g, " "));
  const facts = new Set<string>();
  for (const m of brief.matchAll(/\$\s?\d+(?:[.,]\d{2})?/g)) facts.add(squash(m[0]));
  for (const m of brief.matchAll(/\b\d{1,2}(?:[:.]\d{2})?\s?(?:am|pm)\b/gi)) facts.add(squash(m[0]).replace(".", ":"));
  return [...facts].filter((f) => !out.replace(/\./g, ":").includes(f));
}

/** Vision content blocks for the Anthropic messages API: image first, then text. */
export function buildTemplateUserContent(ref: ReferenceImage, text: string) {
  return [
    { type: "image" as const, source: { type: "base64" as const, media_type: ref.mediaType, data: ref.base64 } },
    { type: "text" as const, text },
  ];
}

/** At upload time: one-line description + a structural spec of the reference. */
export const TEMPLATE_DESCRIBE_PROMPT = `You are cataloguing a reference DESIGN (a poster / social graphic) for a brand design tool. Return JSON only, no prose, shaped exactly:
{"description": "...", "layoutSpec": "...", "words": ["..."]}

"description": ONE punchy sentence a marketer would use to find this style (e.g. "loud lime-and-black party poster, giant stacked headline top-left, one framed photo bottom-right, sticker badges"). No full stop at the end.

"layoutSpec": a precise structural read, 120–220 words, plain sentences, then a final paragraph starting "STYLE DNA:" with 3–5 short clauses naming what makes this style recognisable (type attitude, colour logic, signature devices, how imagery is treated). The read covers in order: canvas orientation and background treatment; the headline (position, approximate share of the canvas, case, line count, colour, effects like outline/shadow); supporting text blocks (what they are, where, size relative to headline); photos (count, position, shape/frame, treatment); decorative elements (badges, stickers, sparkles, patterns — what and where); colour blocking and dominant palette; overall mood. Describe positions as regions (top-left, centre band, bottom-right) and sizes as fractions of the canvas. Do not mention specific brand names or the actual words on the poster.

"words": every distinct line of text visible on the design, VERBATIM, as separate strings in reading order (headline lines, taglines, badge copy, prices, dates, venues). These are the placeholders a new design must replace, so be complete.`;
