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
}): string {
  const { templateName, format, brief, layoutSpec, referenceText } = opts;
  // Only DISTINCTIVE WORDS are placeholders. Never list prices, times, dates or
  // generic labels ("ONLY", "PER PERSON"): telling the model "never write $100"
  // measurably nudged it into writing $5 instead of the brief's $25.
  const GENERIC = /^(only|per person|free|entry|every|from|pm|am|the|and|with|at|to|of|all in|mad monkey|mad monkey hostels)$/i;
  const placeholders = (referenceText ?? [])
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && /[a-z]{3,}/i.test(w) && !/^[\s$€£\d.,:%&'-]+$/.test(w) && !GENERIC.test(w));
  return [
    `REFERENCE DESIGN ATTACHED (template "${templateName}"). Reproduce its LAYOUT and STYLE for a completely NEW event. The reference's words are PLACEHOLDERS — every one of them gets replaced.`,
    ``,
    `NEW EVENT DETAILS (the ONLY text allowed on the design comes from here):`,
    brief.trim(),
    ``,
    `TEXT SWAP (hard rule — the validator rejects copied reference text):`,
    `• The reference's HEADLINE slot must show the NEW event's name (the first thing in the details), set in the same style, case and size. Do NOT keep the reference headline.`,
    `• The reference's tagline / hook slot gets a fresh one-line hook written for the NEW event. Badge, price, date, venue, body: all refilled from the details above.`,
    `• NUMBERS ARE SACRED: every price, time and date in the details appears EXACTLY as given ($25 stays $25, never $5 or "25"; 4:30pm stays 4:30pm). If a badge or slot is too small for the number, ENLARGE the badge or use a smaller font, never shorten the number.`,
    placeholders.length
      ? `• Reference text you must NOT reuse anywhere: ${placeholders.map((w) => `"${w}"`).join(", ")}. If any of these words are not in the new event details, they must not appear.`
      : `• Do not reuse any word or phrase you can read in the reference image unless it also appears in the new event details.`,
    ``,
    `HOW TO REPRODUCE IT — treat the reference as the source of truth for everything except the words:`,
    `• COMPOSITION: same zones, same alignment grid, same placement of every element (headline block, sub-copy, offer/price, date/venue, photo(s), stickers/badges, decorative motifs). Same negative space. If the headline sits top-left in the reference, it sits top-left here.`,
    `• HIERARCHY & SCALE: same relative type sizes — the headline is as dominant here as it is there; supporting lines stay as small as they are there. Same line count where the copy allows; wrap the new words to fit the same block, never spill.`,
    `• STYLE: same energy, same case (uppercase stays uppercase), same weight, same text effects (outlines, hard shadows, plates/pills), same photo treatment (frame shape, rotation, filters, halftone, duotone) and the same kind and count of decorative elements, built from the craft-kit equivalents.`,
    `• COLOUR & TYPE MAPPING: the reference may use colours or fonts outside this brand's approved set. Map each to the CLOSEST approved palette colour and approved font with the same role (display → display, caps → caps). Never copy an off-brand hex or font — the validator rejects it.`,
    `• PHOTOS: same number of photos in the same positions and shapes; pick the best-matching bank photo for each slot from the IMAGE BANK by description. If the reference has no photo, use none.`,
    `• CONTENT SWAP: replace the reference's headline, dates, prices, venue and body with the NEW EVENT DETAILS in the same slots. Do not invent extra lines the reference doesn't have; if a detail has no slot, put it in the smallest existing supporting slot.`,
    `• Reproduce, don't reinterpret. Someone holding the reference next to your output should see the same poster with different words.`,
    layoutSpec?.trim()
      ? `\nSTRUCTURAL READ OF THE REFERENCE (use it to double-check positions and sizes):\n${layoutSpec.trim()}`
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

"layoutSpec": a precise structural read, 120–220 words, plain sentences, covering in order: canvas orientation and background treatment; the headline (position, approximate share of the canvas, case, line count, colour, effects like outline/shadow); supporting text blocks (what they are, where, size relative to headline); photos (count, position, shape/frame, treatment); decorative elements (badges, stickers, sparkles, patterns — what and where); colour blocking and dominant palette; overall mood. Describe positions as regions (top-left, centre band, bottom-right) and sizes as fractions of the canvas. Do not mention specific brand names or the actual words on the poster.

"words": every distinct line of text visible on the design, VERBATIM, as separate strings in reading order (headline lines, taglines, badge copy, prices, dates, venues). These are the placeholders a new design must replace, so be complete.`;
