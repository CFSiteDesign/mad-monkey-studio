// Event templates (Oct 2026): five new styles for the nightly-event posters,
// built from the marketing brief (Designs 1-3) and moodboard (two families).
// They live in the Design system picker next to Brand / Girly Pop / Minimal
// Bold. Each carries its own full style spec ("ownStyle"), always uses a real
// bank photo ("photoRequired"), prints the event title as the headline
// (briefMode "title") and carries only the wordmark.
//
//   npx convex run seedTemplates:seedEventTemplates          (local)
//   npx convex run seedTemplates:seedEventTemplates --prod   (production)
import { internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const STORY_SAFE = `9:16 STORY SAFE ZONE: Instagram covers the top ~230px and the bottom ~400px of a 1080x1920 story with its own UI. Keep EVERY text element and the wordmark between y=240 and y=1510. The safe zone is for TEXT ONLY: the photo / background colour / ghost words keep running edge to edge underneath. NEVER paint the unsafe zones a different colour, never add a black or coloured band, bar or box at the top or bottom of the canvas.`;

const COMMON_RULES = `UNIVERSAL RULES (all event templates):
- Copy comes ONLY from the brief's labelled lines (HEADLINE, DETAILS, WHEN, WHERE, PRICE, KEY LINE). Every fact appears exactly ONCE. IGNORE the TAGLINE line unless this template names a slot for it. Never invent a time, price, perk, line-up name or place detail. Prices and times are copied character for character.
- The HEADLINE is the event title exactly as written in the brief (UPPERCASE). Never reword it, never swap it for a pun.
- The KEY LINE is "time - perk". When this template ALSO prints the WHEN line (eyebrow, small print, giant date), print only the KEY LINE's perk part, so a time, day or date never appears twice (the validator checks every time, weekday and date).
- Put font-family, font-weight, font-size, text-anchor and fill directly ON EVERY <text> element (never only on a parent <g>).
- Text never overlaps other text. STACKED LINES: each next baseline sits at least 0.92 x the LOWER line's font-size below the previous baseline (Anton: 0.9 x, its capitals are 0.86 x the font-size tall). Never squeeze the pitch to fit a space: shrink the font-sizes instead. The validator measures this exactly.
- HEADLINE SIZE TABLE (use it, do not go smaller): the headline is the biggest thing on the poster. For a line of N characters on a canvas W wide, Montserrat 900 / Archivo Black need about 0.74 x N x font-size of width and Anton about 0.46 x N x font-size. So on a 1080-wide story an Archivo Black or Montserrat line of 4 letters is about 300px, 6 letters about 210px, 8 letters about 160px, 10 letters about 125px, 12 letters about 105px; Anton lines are about 1.6x those sizes (capped by the template). On the 1600-wide landscape canvas multiply by about 1.45 (then apply the height caps). A headline that leaves the side margins mostly empty is WRONG.
- Text inside a pill, badge or bar is centred with text-anchor="middle" + dominant-baseline="central" at the shape's exact centre, and the shape plus its text(s) sit together in ONE <g> of their own (the overflow check reads that group). Every line must fit inside its shape with padding.
- Image hrefs: only exact URLs from the IMAGE BANK list, plus /mm-logo-white.png or /mm-logo-black.png for the wordmark.
- The wordmark never sits on the photo's FACES band or on top of a person's face.
- Separators between facts: " - ", " / " or " • " as the template says. Never an em dash.
- No emoji, no symbol glyphs, no ALL IN sticker, no stamp, no grain, no starbursts unless the template asks for them.`;

type Tpl = {
  name: string;
  label: string;
  description: string;
  guidelines: string;
  palette: { primary: string[]; secondary: string[]; neutral: string[] };
  fontsAllowed: string[];
  fontRules: string;
  effects: NonNullable<Doc<"design_systems">["effects"]>;
};

const TEMPLATES: Tpl[] = [
  // ── Design 1 ──────────────────────────────────────────────────────────────
  {
    name: "event-photo",
    label: "Event Photo",
    description: "Nightly events: the event's own photo full-bleed, big white title, details and time.",
    guidelines: `EVENT PHOTO TEMPLATE. The nightly-event poster from the brief. Picture the two references: (1) "HOI AN BICYCLE TOUR": one full-bleed photo of a girl riding a bike through a market, and in the lower part a centred stack of BIG WHITE bold type: the title on two lines, the stops "DUCK STOP - LANTERN MAKING - OLD TOWN - TAILOR SHOP - GALLERY - JAPANESE BRIDGE" in smaller bold caps, then "11AM TOMORROW - LUNCH INCLUDED". (2) "SUNSET RIVER CRUISE": a full-bleed photo of a boat packed with cheering travellers, the same white stack at the TOP over the boat roof, with "4PM TODAY - 5 DRINKS INCLUDED". No boxes, no stickers, no colour: the photo sells the event, the type says what, when and what's included. Clean, confident, instantly readable on a phone.

LAYERS, back to front, and nothing else:
1. The PHOTO, full-bleed: <image href="EXACT_URL" .../> with the EXACT x / y / width / height / preserveAspectRatio listed in that photo's [full-bleed: ...] data (it frames the faces). Natural colour: NO filter, NO tint, NO duotone, NO colour overlay.
2. ONE soft scrim behind the text block, for legibility: a full-width rect covering the text band plus ~10% of the canvas height beyond it, filled with a vertical linearGradient of #000000 from stop-opacity 0.6 at the canvas edge nearest the text to stop-opacity 0 toward the middle of the photo. It must fade out before the FACES band. Never a hard-edged box, never coloured.
3. The TEXT BLOCK (white, centred).
4. The wordmark.

THE TEXT BLOCK: one centred column, every line text-anchor="middle" at x = W/2, fill #FFFFFF, UPPERCASE, "Montserrat" only. Three parts:
 A. HEADLINE (brief HEADLINE line, verbatim). Montserrat font-weight="900". Split onto TWO lines at the natural break ("HOI AN" / "BICYCLE TOUR", "SUNSET" / "RIVER CRUISE", "BEER" / "PONG", "PUB" / "CRAWL"); a single short word stays on one line; a long title may use three lines. Size EACH line on its own to fill 80-90% of the canvas width: font-size = (0.85 x W) / (0.75 x number of characters in that line, counting spaces), but never above 0.2 x W (stories) or 0.11 x W (landscape). The shorter line therefore comes out BIGGER, like SUNSET over RIVER CRUISE. Line pitch: each next baseline = previous baseline + 0.92 x the LOWER line's font-size (e.g. BEER at 216 then PONG at 216: baselines 216 x 0.92 = 199 apart). letter-spacing="-0.01em".
 B. DETAILS (only if the brief has a DETAILS line): its items joined with " - ", Montserrat font-weight="800", font-size about 0.034 x W on a 9:16 story (about 37px) or 0.026 x W on landscape (about 42px). Wrap into 1-3 centred lines of similar length; NEVER split an item across two lines; line pitch 1.2 x font-size. The first details line sits about 0.55 x the last headline line's font-size below the headline baseline.
 C. KEY LINE (brief KEY LINE, e.g. "11AM TOMORROW - LUNCH INCLUDED"): Montserrat font-weight="800", about 1.12 x the details size, ONE line (two only if it cannot fit), with a gap of about 1.3 x its font-size above it. If the brief has PRICE and it is not already in the key line, append it (" - $15"). WHERE is optional: use it only if the key line has room.
 Every text element gets filter="url(#tsh)": define it ONCE in your <defs>: <filter id="tsh" x="-10%" y="-30%" width="120%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000000" flood-opacity="0.5"/></filter>. This is the ONLY filter, and the ONLY place blur is allowed.

PHOTO CHOICE: among the photos that fit the event, pick one whose [full-bleed] data lists a text-safe band of at least 34% of the canvas height (on landscape at least 30%). A photo listing "no face-free band" cannot be used for this template.

PLACEMENT: put the text block inside a "text-safe" band listed for the chosen photo (measured from its pixels for this canvas). It must NEVER cross the FACES band: the validator maps every face in the photo onto the canvas and rejects any text on one. Prefer the BOTTOM band (bicycle poster) when it is at least 32% of the canvas height, otherwise the TOP band (cruise poster).

FIT THE BLOCK (do this arithmetic before writing the SVG): block height = 0.7 x the first headline size + 0.92 x each further headline line's size + 0.55 x the last headline size + (details lines x 1.2 x the details size) + 2.0 x the key line size. The band height is its % range times H, minus 2% of H at the face side. If the block is taller than the band, multiply EVERY size in the block by (band height / block height) and recompute. Then place it: in a bottom band the key line's baseline sits at the band's bottom limit; in a top band the first headline line's capitals start at the band's top limit.
 - 9:16 story 1080x1920: the story safe zone applies, so a bottom block ends by y=1490 and a top block starts at y=250.
 - WhatsApp landscape 1600x1052: the block stays centred on x=800; top or bottom band; at least 56px from the top and bottom edges. A title of up to 16 characters stays on ONE line; longer titles use two. Each headline line max font-size 0.11 x W (about 176px). Details at most 2 lines.
 - Other formats: same rules with 6% margins.
 The whole block (headline + details + key line) must fit inside the chosen band (see FIT THE BLOCK). Never let it spill onto faces to keep a size.

WORDMARK: /mm-logo-white.png, width 120-140 (height = width x 0.3), right-aligned 48px from the right edge, in the band the text block does NOT use: bottom-right if the text is in the top band, top-right if the text is in the bottom band. On 9:16 stories: bottom-right means y about 1440, top-right means y about 260. Never touching the text.

STRICTLY BANNED: stickers, starbursts, badges, pills, plates, boxes or bars behind text; outlines or strokes on text; hard offset shadows; any text colour other than white; rotation or skew; more than one photo; photo filters; a second font family.

TONE: factual and clean. Title, what happens, when, what's included. No pun headline, no exclamation marks.`,
    palette: { primary: ["#FFFFFF"], secondary: ["#0A0A0A"], neutral: ["#000000"] },
    fontsAllowed: ["Montserrat"],
    fontRules: `ONE family only: "Montserrat", UPPERCASE. Headline font-weight="900". Details and key line font-weight="800". Every text element uses filter="url(#tsh)" (the soft legibility shadow defined in <defs>). Never any other font.`,
    effects: {
      ownStyle: true,
      textOffFaces: true,
      photoRequired: true,
      wordmarkOnly: true,
      briefMode: "title",
      singlePhoto: true,
      noRotation: true,
      noEmoji: true,
      maxLinearGradients: 2,
      allowRadialGradients: false,
      forbidBlur: false,
      noTextOnImages: false,
    },
  },

  // ── Design 2 ──────────────────────────────────────────────────────────────
  {
    name: "big-block",
    label: "Big Block",
    description: "Nightly events: vibe photo, giant slanted block headline in colour, details band.",
    guidelines: `BIG BLOCK TEMPLATE. Picture the references: "HOUSE PARTY" in enormous slanted orange-to-yellow letters over a dark, packed party photo with "THIS SATURDAY AUG 22" on top and "10PM - 2AM" in an outlined pill below; "PINK MILES" in giant slanted WHITE letters over a pink-washed photo of runners; "NIGHT SHIFT" in chrome-blue block letters with the line-up below separated by dots. The headline is huge and colourful, the photo is a moody backdrop, the details sit in a tidy band under the headline.

LAYERS, back to front:
1. The VIBE PHOTO, full-bleed, using the EXACT x / y / width / height / preserveAspectRatio listed in that photo's [full-bleed: ...] data. Pick the event's literal activity if the bank has it, else a general Mad Monkey crowd/night shot.
2. MOOD WASH over the whole canvas, ONE of:
   - DARK: <rect width="W" height="H" fill="#0A0A0A" opacity="0.5"/>. For parties, clubs, bar nights. Pair with HEAT or ICE headline colour.
   - COLOUR: <rect width="W" height="H" fill="#FF01AA" opacity="0.55"/> (or #AB00FF or #0081F7), then <rect width="W" height="H" fill="#0A0A0A" opacity="0.2"/>. For daytime, sport, pool, run events (the PINK MILES look). Pair with the PURE headline.
3. The HEADLINE block.
4. EYEBROW above it, DETAILS BAND below it.
5. The wordmark.

HEADLINE: the brief HEADLINE (event title) verbatim, UPPERCASE, font-family="Anton". Split onto 2 lines at the natural break (1 line for a single short word; 3 lines only for a 4+ word title). It is SLANTED: put all headline lines in ONE group <g transform="translate(CX CY) skewX(-9)"> with each <text> at x="0" text-anchor="middle", CX = W/2, CY = the first line's baseline, and the next line at y = 0.9 x font-size. Size each line to fill 86-94% of the width: font-size = (0.9 x W) / (0.48 x characters in that line), capped at 0.36 x W and at 0.3 x H. Lines are tight (pitch 0.9 x font-size). Pick ONE colour treatment:
 - HEAT (party, club, fire, BBQ, rooftop sunset): fill="url(#heat)", a vertical linearGradient #FFC000 at the top to #FF6600 at the bottom.
 - ICE (night, techno, chill, rooftop at night): fill="url(#ice)", a vertical linearGradient #FFFFFF to #00FEF3 (at 45%) to #0081F7 at the bottom, plus stroke="#FFFFFF" stroke-width="3".
 - PURE (sport, run, daytime, any COLOUR wash): fill="#FFFFFF".
 The headline may carry filter="url(#glow)": define <filter id="glow" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.45"/></filter>. No other filter.

EYEBROW (above the headline, never touching it: the headline's first baseline sits at least 0.7 x the eyebrow size + 0.86 x the headline size below the eyebrow's baseline): the day/date part of the brief WHEN line only, e.g. "THIS SATURDAY - AUG 22" (the time goes in the pill below, never in both), "Montserrat" font-weight="800", letter-spacing="0.22em", font-size about 0.03 x W, #FFFFFF, centred. Optionally put the date part inside a thin outlined pill (rounded rect, fill="none", stroke 3px in the headline accent colour, rx = height/2).

DETAILS BAND (below the headline, centred, in this order, each only if the brief has it):
 - The time from WHEN ("10PM - 2AM"), plus " - " and the KEY LINE's perk if it fits, inside an outlined pill: fill="none", stroke 3px in the accent colour, rx = height/2, text Montserrat 800 #FFFFFF, font-size about 0.034 x W.
 - DETAILS items (line-up, perks) joined with " • ", Montserrat font-weight="700", #FFFFFF, font-size about 0.03 x W, 1-2 lines.
 - A bottom strip of small facts joined with " / " (WHERE / PRICE), Montserrat 700, letter-spacing 0.12em, font-size about 0.022 x W, near the bottom margin.
 Accent colour: #FFC000 for HEAT, #00FEF3 for ICE, #FFFFFF for PURE.

PLACEMENT:
 - 9:16 story: eyebrow at y about 330; headline block centred around y 760-1050; details band right below it; bottom strip ending by y 1490. The story safe zone applies (all text between y=240 and y=1510).
 - WhatsApp landscape 1600x1052: eyebrow at y about 110; headline in the middle (2 lines, each about 0.26-0.3 x H); details band under it; bottom strip at y about 990. 56px margins.
 - The headline may sit over people (the wash keeps it readable). Keep the small details text off the FACES band when the photo leaves room.

WORDMARK: /mm-logo-white.png, width 120-130, bottom-right with 48px padding (stories: y about 1440), clear of the bottom strip (put the strip left of it or above it).

STRICTLY BANNED: stickers, starbursts, ALL IN sticker, photo frames or cut-out shapes (the photo is always full-bleed), rotation (skewX on the headline group is the ONLY transform besides translate/scale), emoji, any font except Anton and Montserrat, more than one photo.

TONE: big, loud, nightlife. Title, when, line-up, where.`,
    palette: {
      primary: ["#FFFFFF", "#FFC000", "#FF6600", "#00FEF3", "#0081F7"],
      secondary: ["#FF01AA", "#AB00FF", "#CCFF01"],
      neutral: ["#0A0A0A", "#000000"],
    },
    fontsAllowed: ["Anton", "Montserrat"],
    fontRules: `Headline: "Anton", UPPERCASE, slanted via skewX(-9) on its group, huge. Eyebrow, pills, details and strip: "Montserrat" font-weight 700-800, UPPERCASE, letter-spaced. Never any other font.`,
    effects: {
      ownStyle: true,
      photoRequired: true,
      wordmarkOnly: true,
      briefMode: "title",
      singlePhoto: true,
      noEmoji: true,
      maxLinearGradients: 3,
      allowRadialGradients: false,
      forbidBlur: false,
      noTextOnImages: false,
    },
  },

  // ── Design 3 ──────────────────────────────────────────────────────────────
  {
    name: "spotlight",
    label: "Spotlight",
    description: "Nightly events: purple page, giant orange title, cut-out people in front, orange details bar.",
    guidelines: `SPOTLIGHT TEMPLATE. Picture the reference ("WIN / A DOUBLE PASS TO CHASE & STATUS"): a flat electric PURPLE page, faint outlined words repeating across the background, an orange logo badge at the top, the event name in GIANT orange letters with a white outline, two people CUT OUT from their photo standing IN FRONT of the lower part of those letters, and the details on a solid orange bar at the bottom in purple caps. Bold, flat, graphic, no texture.

LAYERS, back to front, in exactly this order:
1. BACKGROUND: <rect width="W" height="H" fill="#AB00FF"/>.
2. GHOST WORDS: the title's main word repeated as 4-6 rows of huge OUTLINE type filling the background. Each row is its own <text> with font-family="Archivo Black", UPPERCASE, font-size about 0.22 x W, fill="none", stroke="#FFFFFF", stroke-width="3", opacity="0.16" (the opacity attribute ON EACH <text>), x = -0.04 x W, rows every 0.95 x font-size from the top to the bottom. Words bleed off both sides: texture, not reading.
3. LOGO BADGE, top-centre: <rect> fill="#FF6600", rx = 0.2 x its height, with the white wordmark <image href="/mm-logo-white.png"> centred inside (wordmark width about 0.24 x W, height = width x 0.3; badge = wordmark plus 0.4 x the wordmark height padding on every side). Badge top at y about 0.05 x H on landscape, y = 250 on 9:16 stories.
4. HEADLINE: the brief HEADLINE (event title) in "Archivo Black", UPPERCASE, fill="#FF6600", stroke="#FFFFFF", stroke-width = 0.05 x font-size, paint-order="stroke fill", stroke-linejoin="round", text-anchor="middle" at x = W/2. ONE line if it can be at least 0.22 x W big, otherwise TWO lines (pitch 0.92 x font-size). Size each line to fill 86-92% of the width: font-size = (0.88 x W) / (0.77 x characters), capped at 0.36 x W and 0.3 x H (e.g. on a 1080 story TRIVIA = 205, NIGHT = 247 capped by nothing; on a 1600 landscape HOUSE PARTY on one line = 167). It sits just under the badge (gap about 0.04 x H).
5. THE PEOPLE (always a cut-out when the IMAGE BANK lists any CUTOUT: the validator rejects a plain photo then):
   Pick the CUTOUT that best fits the event (or a general fun group). On a 9:16 story prefer one that is about square or taller than wide (width / height at most 1.2): a wide group cannot get big enough to reach the headline. ONE <image href="CUTOUT_URL" preserveAspectRatio="xMidYMax meet"> whose box has EXACTLY the cut-out's listed aspect ratio, so the box IS the picture. Work out the details bar first (step 6), then:
     top    = (baseline of the LAST headline line) - 0.45 x (that line's font-size)   (heads rise INTO the headline)
     bottom = bar top + 0.5 x bar height                                              (feet hidden INSIDE the bar)
     height = bottom - top;  width = height x (cutout width / cutout height)
     It may be wider than the canvas (up to 1.4 x W, centred): the canvas crops the sides; keep the faces inside the canvas.
     x = W/2 - width/2. If the cut-out is listed as cut off at its LEFT edge, x = 0; at its RIGHT edge, x = W - width (the straight cut sits on the canvas edge).
   Draw it AFTER the headline (the people stand IN FRONT of the letters) and BEFORE the bar (they stand IN the bar). Nothing of the people may show below the bar: the validator checks the picture's bottom lands inside a solid shape drawn after it.
   FALLBACK only when the bank lists no CUTOUT at all: the best regular photo as a straight rectangle between the headline and the bar, full width minus 6% margins, preserveAspectRatio="xMidYMid slice", with a 10px #FFFFFF stroke frame; the headline stays fully ABOVE it.
6. DETAILS BAR, drawn LAST: a solid <rect> fill="#FF6600", x from 5% to 95% of W, holding EXACTLY TWO centred lines of "Archivo Black" UPPERCASE fill="#AB00FF" (text-anchor="middle" at W/2):
   Line 1 = the brief KEY LINE, copied word for word on ONE line.
   Line 2 = the WHERE line (plus " - " PRICE if given), on ONE line.
   Each line's font-size = the smaller of 0.05 x W and (0.84 x bar width) / (0.8 x characters in that line, counting spaces), so each line fits on one row with padding at both ends (Archivo Black is about 0.77 x the font-size per character; text running past the bar's ends is rejected). Never wrap a line onto a third row, never drop line 2. Line pitch 1.15 x the larger font-size; bar height = both lines + 0.55 x font-size padding top and bottom. Landscape: bar bottom at H - 48. 9:16 story: bar bottom at y = 1500.
   Optional: the DETAILS items as ONE small line in Montserrat font-weight="800" #FFFFFF, letter-spacing 0.1em, directly above the bar, only if it fits clear of the people.

LAYOUT BY FORMAT:
 - 9:16 story: badge y 250, headline about y 450-750, cut-out from about y 620 down behind the bar, bar ending y 1500. Below the bar: just the purple background.
 - WhatsApp landscape 1600x1052: badge y about 50 (smaller badge, wordmark width about 0.14 x W), headline centred about y 200-420 (one line preferred), cut-out centred, about 0.6 x H tall, bar at the bottom.

THE WORDMARK lives INSIDE the top badge. That badge IS the brand mark: do NOT add a second wordmark in a corner (this overrides the LOGO section's bottom-right rule).

STRICTLY BANNED: stickers, starbursts, sparkles, gradients, blur, rotation, extra colours, the ALL IN sticker, more than one photo or cut-out, emoji, rounded corners on the details bar.`,
    palette: { primary: ["#AB00FF", "#FF6600", "#FFFFFF"], secondary: ["#0A0A0A"], neutral: ["#000000"] },
    fontsAllowed: ["Archivo Black", "Montserrat"],
    fontRules: `Headline, ghost words and the details bar: "Archivo Black", UPPERCASE (its single weight, do not set font-weight). Optional small details line: "Montserrat" font-weight 800 UPPERCASE. Never any other font.`,
    effects: {
      ownStyle: true,
      photoRequired: true,
      wordmarkOnly: true,
      briefMode: "title",
      useCutouts: true,
      singlePhoto: true,
      noRotation: true,
      noEmoji: true,
      maxLinearGradients: 0,
      allowRadialGradients: false,
      forbidBlur: true,
      noTextOnImages: false,
    },
  },

  // ── Moodboard family A ────────────────────────────────────────────────────
  {
    name: "giant-type",
    label: "Giant Type",
    description: "Movie-poster style: one bold colour, giant stacked title, cut-out people in front.",
    guidelines: `GIANT TYPE TEMPLATE (from the moodboard). Picture "ON THE COME UP" (lime page, giant condensed black letters running the full height, a face looking out through them), "RUN" (letters bigger than the athlete, the athlete in front), "TASTE LIKE GINGER" (yellow page, huge stacked red words, a face at the bottom), "IT SMELLS LIKE GINGER" (blue page, red stacked words, a face pushing up from the bottom). ONE flat colour, ONE giant word stack, ONE person or group in front, a little movie-poster small print. Loud and simple.

COLOURWAY: pick ONE pair to suit the event (background + type colour):
 lime #CCFF01 + black #0A0A0A · yellow #FFC000 + pink #FF01AA · blue #0081F7 + pink #FF01AA · pink #FF01AA + lime #CCFF01 · purple #AB00FF + lime #CCFF01 · orange #FF6600 + black #0A0A0A.
 Small print colour: #0A0A0A on the light pages (lime, yellow, orange), #FFFFFF on the saturated pages (blue, pink, purple), so it reads at a glance.

LAYERS, back to front:
1. Background: <rect width="W" height="H" fill="(background colour)"/>.
2. GIANT WORD STACK: ONLY the brief HEADLINE (event title) words, never DETAILS or anything else, in font-family="Anton", UPPERCASE, one word per line, but pair short words so the stack is at most 3 lines (HOI AN / BICYCLE / TOUR, BEER PONG / TOURNAMENT), LEFT-aligned at x = 0.06 x W (text-anchor="start"). EVERY line fills 88% of the width (Anton is about 0.46 x font-size per letter): font-size = (0.88 x W) / (0.46 x letters in that line), then capped so the whole stack is at most 0.55 x H tall on a 9:16 story (the small print needs the rest of the safe zone) or 0.66 x H on landscape (stack height is about 0.86 x the first size + 0.9 x each further size). On a 1080-wide story that means: 3 letters about 560px (before the cap), 5 letters about 410px, 6 letters about 345px, 8 letters about 260px; the validator gives the exact sizes if you are off. Lines packed tight: each next baseline exactly 0.9 x the LOWER line's font-size below the previous (Anton capitals are 0.86 x the font-size tall, so that leaves a hairline gap); never a bigger gap. Max 3 lines. The stack is the poster: it must look almost too big. Use the computed sizes, do not shave them "to be safe": the validator measures Anton letter by letter.
3. THE PEOPLE, in FRONT of the stack (always a cut-out when the IMAGE BANK lists any CUTOUT: the validator rejects a plain photo then):
   Pick the CUTOUT that best fits the event (or a general fun group). ONE <image href="CUTOUT_URL" preserveAspectRatio="xMidYMax meet"> whose box has EXACTLY the cut-out's listed aspect ratio, anchored to the BOTTOM edge of the canvas: y + height = H exactly (the people's cut-off bodies run off the bottom). Height 0.5-0.65 x H (tall enough that the heads rise into the stack's last line), width = height x aspect. It may be wider than the canvas (up to 1.4 x W): the canvas crops the sides, keep the faces inside. Never lift it off the bottom edge to make it fit. Centred or right of centre; if the cut-out is listed as cut off at its LEFT edge, x = 0; at its RIGHT edge, x = W - width. It overlaps the lower lines of the stack; no line may be more than about 45% covered.
   FALLBACK only when the bank lists no CUTOUT at all: the best photo fills the BOTTOM 45% of the canvas full-bleed (x 0, y 0.55 x H, width W, preserveAspectRatio="xMidYMin slice"), monochrome via your own filter <filter id="mono"><feColorMatrix type="saturate" values="0"/></filter>, with a rect in the background colour at opacity 0.35 over it. The stack's last line overlaps the photo's top edge by about half its height (draw the type AFTER the photo).
4. SMALL PRINT (movie-poster credits), "Montserrat" font-weight="700", UPPERCASE, letter-spacing="0.14em", font-size about 0.022 x W, in the small print colour, on flat background only: never on the people (the validator checks the cut-out's whole picture box). EXACTLY two lines, each fact once:
   - LINE 1: the WHEN line (day / date / time).
   - LINE 2: the KEY LINE's perk part, the DETAILS items, WHERE, then PRICE if given, joined with " / ". (Never the KEY LINE's time: it is already in line 1.) If it is too long for one line, split it over two lines at a " / ".
   - Optional TAGLINE slot: the brief TAGLINE as one line in Montserrat 700 caps (about 0.024 x W) on clear background. Only if it fits clear of the people.
5. The wordmark.

LAYOUT BY FORMAT:
 - 9:16 story: both small print lines at the TOP (line 1 at y about 270, line 2 about 1.6 x its font-size below); the stack's first capitals start at least 2.2 x the small print size below line 2; the cut-out runs to the bottom edge (it is imagery), every text element stays between y=240 and y=1510.
 - WhatsApp landscape 1600x1052: stack on the LEFT 62% of the width (size lines against 0.6 x W instead of W), its first capitals at least 2.2 x the small print size below line 1; cut-out on the right, overlapping the stack's right end; line 1 top-left at y about 70, line 2 bottom-left at y about 1000, ending at least 40px LEFT of the cut-out's x (shrink it or split it over two lines if needed).

WORDMARK: tiny, /mm-logo-black.png on light backgrounds (lime, yellow, orange) or /mm-logo-white.png on the saturated ones (blue, purple, pink), width about 120, in a TOP corner of flat background (top-right, level with small print line 1, 48px from the right edge), never on or beside the people.

STRICTLY BANNED: stickers, starbursts, gradients, blur, rotation, outlines on the giant type, a second background colour, photo filters, emoji, any font except Anton and Montserrat.`,
    palette: {
      primary: ["#CCFF01", "#FFC000", "#0081F7", "#FF01AA", "#FF6600", "#AB00FF"],
      secondary: ["#FFFFFF"],
      neutral: ["#0A0A0A"],
    },
    fontsAllowed: ["Anton", "Montserrat"],
    fontRules: `Giant stack: "Anton", UPPERCASE, left-aligned, each line filling the width. Small print: "Montserrat" font-weight 700 UPPERCASE letter-spaced. Never any other font.`,
    effects: {
      ownStyle: true,
      photoRequired: true,
      wordmarkOnly: true,
      briefMode: "title",
      useCutouts: true,
      stackFill: { width: 0.88, landscapeWidth: 0.53, maxHeight: 0.55, landscapeMaxHeight: 0.66 },
      singlePhoto: true,
      noRotation: true,
      noEmoji: true,
      maxLinearGradients: 0,
      allowRadialGradients: false,
      forbidBlur: true,
      noTextOnImages: false,
    },
  },

  // ── Moodboard family B ────────────────────────────────────────────────────
  {
    name: "underground",
    label: "Underground",
    description: "Club-flyer minimal: moody monochrome photo, small white type, giant bracketed date.",
    guidelines: `UNDERGROUND TEMPLATE (from the moodboard). Picture "DUNIA / HEARTHUG" (a dark moody photo washed deep colour, tiny white type pinned to the corners, the name small and centred) and "LAB / house party" (a black-and-white street photo, a scatter of small white labels, the date HUGE in brackets along the bottom: [16 . 10 . 26]). Mostly photo, very little type, every word small and deliberate, EXCEPT the giant bracketed date. Cool, minimal, after-dark.

PHOTO CHOICE: a photo that fits the event whose [full-bleed] data lists a text-safe band of at least 25% of the canvas height (the headline and details live there).

LAYERS, back to front:
1. The PHOTO, full-bleed, using the EXACT x / y / width / height / preserveAspectRatio listed in that photo's [full-bleed: ...] data, turned MONOCHROME with a filter you define: <filter id="mono"><feColorMatrix type="saturate" values="0"/></filter> and filter="url(#mono)" on the <image>.
2. MOOD: <rect width="W" height="H" fill="#0A0A0A" opacity="0.4"/>, then optionally ONE colour wash <rect width="W" height="H" fill="#AB00FF" opacity="0.25"/> (or #FF01AA) for the DUNIA look; no wash for the LAB look.
3. TYPE, all #FFFFFF:
   - TOP ROW: 2-4 tiny labels spread across the top (left-aligned at x = 0.06 x W, one around 0.36 x W, one around 0.62 x W, the last right-aligned at 0.94 x W), font-family="Inter" font-weight="600", UPPERCASE or lowercase, font-size about 0.02 x W. Labels ONLY from WHERE, PRICE, the KEY LINE's perk, DETAILS items and TAGLINE. NEVER a day, date or time here: those live in the giant date only. Never invent labels.
   - HEADLINE: the brief HEADLINE (event title), "Inter" font-weight="900", about 0.08-0.1 x W, letter-spacing="-0.02em", left-aligned at x = 0.06 x W in the lower-middle area (LAB) or centred (DUNIA), inside the photo's text-safe band: the validator rejects any text on a face. If the band is small, use ONE line and a smaller size (down to 0.06 x W).
   - DETAILS (line-up names or highlights), "Inter" font-weight="900", about 0.05 x W, stacked one per line under a tiny "[lineup]" or "[highlights]" label in Inter 600 at 0.02 x W. Only if the brief has DETAILS.
   - GIANT DATE along the bottom, built ONLY from the WHEN facts: "[DD . MM . YY]" (e.g. [16 . 10 . 26]) only when WHEN states the year; with a day and month but no year: "[SAT . 22 . 08]" or "[22 . 08]" (never invent a year); with no calendar date: the weekday and time ("[TUE & FRI . 8PM]"). If WHEN has a time the giant date does not show, put that time in ONE small label (Inter 600, 0.02 x W) just above the giant date's left end. font-family="Inter" font-weight="400", font-size = (0.9 x W) / (0.55 x characters), letter-spacing="-0.03em", left-aligned at x = 0.05 x W, baseline at about 0.9 x H (stories: y about 1480).
   - Optional small corner labels (price, "+18", a perk; never a time or day, those are in the giant date) in Inter 600 at 0.02 x W, at the left/right just above the giant date.
4. The wordmark.

LAYOUT BY FORMAT:
 - 9:16 story: top row y about 280; headline around y 1000-1150; giant date baseline about y 1480; all text between y=240 and y=1510.
 - WhatsApp landscape 1600x1052: top row y about 60; headline about y 560-700; giant date baseline about y 990 (size it against 0.92 x W).

WORDMARK: /mm-logo-white.png, width about 110, top-right under the top row (9:16 stories: y about 300, never above y=250) or bottom-right above the date, 48px padding, never touching text or a face.

STRICTLY BANNED: colour photos (always monochrome), stickers, starbursts, pills, plates, outlines, gradients, blur, rotation, emoji, any font except Inter and Archivo Black, big type other than the date.`,
    palette: { primary: ["#FFFFFF", "#0A0A0A"], secondary: ["#AB00FF", "#FF01AA"], neutral: ["#000000"] },
    fontsAllowed: ["Inter", "Archivo Black"],
    fontRules: `"Inter" for everything: labels font-weight 600, headline and line-up font-weight 900, the giant bracketed date font-weight 400. "Archivo Black" only if a single word needs extra punch. Never any other font.`,
    effects: {
      ownStyle: true,
      textOffFaces: true,
      photoRequired: true,
      wordmarkOnly: true,
      briefMode: "title",
      singlePhoto: true,
      noRotation: true,
      noEmoji: true,
      maxLinearGradients: 0,
      allowRadialGradients: false,
      forbidBlur: true,
      noTextOnImages: false,
    },
  },
];

export const seedEventTemplates = internalMutation({
  args: {},
  handler: async (ctx) => {
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_slug", (q) => q.eq("slug", "mad-monkey"))
      .first();
    if (!brand) throw new Error("Run seedMadMonkey first.");
    const results: { name: string; status: string }[] = [];
    for (const t of TEMPLATES) {
      const doc = {
        brandId: brand._id,
        name: t.name,
        label: t.label,
        description: t.description,
        guidelines: `${t.guidelines}\n\n${STORY_SAFE}\n\n${COMMON_RULES}`,
        baseCssVars: "{}",
        palette: t.palette,
        fontsAllowed: t.fontsAllowed,
        fontRules: t.fontRules,
        effects: t.effects,
        isActive: true,
        createdAt: Date.now(),
      };
      const existing = await ctx.db
        .query("design_systems")
        .withIndex("by_brand", (q) => q.eq("brandId", brand._id))
        .filter((q) => q.eq(q.field("name"), t.name))
        .first();
      if (existing) {
        const { createdAt: _keep, ...update } = doc;
        await ctx.db.patch(existing._id, update);
        results.push({ name: t.name, status: "updated" });
      } else {
        await ctx.db.insert("design_systems", doc);
        results.push({ name: t.name, status: "created" });
      }
    }
    return results;
  },
});
