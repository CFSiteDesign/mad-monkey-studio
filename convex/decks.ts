"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildSystemPrompt,
  stripFences,
  FORMAT_DIMENSIONS,
  DISPLAY_FONTS,
  ACCENT_FONTS,
} from "../lib/prompt";
import { validateSvg, extractStatedColors, escapeStrayAmpersands, normalizeSvgRoot } from "../lib/validate";
import { pixelValidate, type PixelResult } from "../lib/pixel-validate";
import { injectBrandKit } from "../lib/brand-kit";
import { injectCountryKit, COUNTRY_KIT_DOC } from "../lib/country-kit";

const OUTLINE_MODEL = "claude-haiku-4-5-20251001";
// Single slide-generation model: Opus 4.8 ($5/1M in, $25/1M out). The cheap
// Haiku OUTLINE_MODEL above still plans the deck; slides are always Opus.
const MODEL = { model: "claude-opus-4-8", inCost: 5 / 1_000_000, outCost: 25 / 1_000_000 } as const;

// Slides are simpler than posters — one correction attempt keeps deck cost sane;
// a slide that still has hard breaks ships best-effort rather than failing the deck.
const MAX_SLIDE_RETRIES = 1;
const SLIDE_FORMAT = "16:9";
// Hard bounds for a user-chosen slide count (keeps cost + Haiku sane).
const MIN_SLIDES = 3;
const MAX_SLIDES = 14;
const DEFAULT_SLIDES = 8;

type OutlineSlide = {
  role: string; // title | content | section | stat | closing
  heading: string;
  points: string[];
  visual: string;
};

function anthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    timeout: 110_000,
    maxRetries: 1,
  });
}

// ── Haiku: deck brief → structured slide outline ────────────────────────────
async function composeOutline(
  client: Anthropic,
  brief: string,
  designSystemDesc: string,
  targetSlides: number,
): Promise<{ title: string; slides: OutlineSlide[]; inputTokens: number; outputTokens: number }> {
  const n = Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, Math.round(targetSlides) || DEFAULT_SLIDES));
  const system = `You are a deck planner for Mad Monkey Hostels (Gen Z party-hostel brand across SE Asia & Australia; slogan ALL IN; voice: your most-travelled friend telling you to book the flight).

Turn the brief into a tight slide-deck OUTLINE. Output STRICT JSON only — no markdown, no prose:
{"title":"<deck title, ≤6 words>","slides":[{"role":"title|content|section|stat|closing","heading":"<≤6 words>","points":["<short line>", ...],"visual":"<one short phrase: a photo subject OR a graphic idea>"}]}

Rules:
- EXACTLY ${n} slides — no more, no fewer. First slide role "title", last role "closing".
- Each content slide: 2–5 SHORT points (≤8 words each) — never paragraphs. Use "stat" role for a slide built around one big number.
- Keep any facts, names, numbers, dates from the brief VERBATIM. Never invent figures.
- APAC ONLY: Mad Monkey operates exclusively in Southeast Asia & Australia (Bali/Uluwatu, Koh Rong & Phnom Penh Cambodia, Thailand, Philippines/El Nido & Cebu, Sydney/Australia). Any place, property, market, currency or example you reference MUST be from this real APAC footprint — never invent non-APAC locations, Western/US/Europe examples, or generic placeholder cities. If the brief names specific places, use those verbatim; otherwise draw only from the APAC hostels above.
- Headings are punchy and concrete. The deck targets: ${designSystemDesc}.`;

  const res = await client.messages.create({
    model: OUTLINE_MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: brief }],
  });
  const text = res.content[0].type === "text" ? res.content[0].text : "";
  let parsed: { title?: string; slides?: OutlineSlide[] };
  try {
    parsed = JSON.parse(stripFences(text).replace(/^[^{]*/, "").replace(/[^}]*$/, ""));
  } catch {
    throw new Error("Couldn't plan the deck — try rephrasing the brief.");
  }
  const slides = (parsed.slides ?? [])
    .filter((s) => s && s.heading)
    .slice(0, MAX_SLIDES);
  if (slides.length < 2) throw new Error("The deck outline came back empty — try a fuller brief.");
  return {
    title: parsed.title?.trim() || "Untitled deck",
    slides,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}

// ── Sonnet: one outline slide → one on-brand 16:9 SVG ───────────────────────
async function generateSlide(
  client: Anthropic,
  systemPrompt: string,
  slide: OutlineSlide,
  index: number,
  total: number,
  deckTitle: string,
  validateOpts: Parameters<typeof validateSvg>[1],
  includeLogo: boolean,
  model: string,
): Promise<{ outputCode: string; notes: string[]; inputTokens: number; outputTokens: number }> {
  const brief = [
    `Slide ${index + 1} of ${total} in the deck "${deckTitle}" — role: ${slide.role}.`,
    `Heading (use as the slide's hook): ${slide.heading}`,
    slide.points.length
      ? `Show these points, kept short and VERBATIM:\n${slide.points.map((p) => `• ${p}`).join("\n")}`
      : `No bullet points — make this a bold ${slide.role} slide carried by the heading.`,
    slide.visual ? `Suggested visual: ${slide.visual}` : "",
    `This is a single 16:9 deck slide — calmer than a poster, reads in 3 seconds, clear hierarchy.`,
    `LAYOUT IS CRITICAL: nothing may overlap. Text must never sit on top of other text, and stickers/badges must never cover text. Give every element its own clear zone with generous gaps. If it feels tight, use fewer words or a smaller font — never overlap.`,
  ]
    .filter(Boolean)
    .join("\n");

  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: brief },
  ];
  let best: { code: string; hard: string[]; soft: string[] } | null = null;
  let inTok = 0;
  let outTok = 0;

  for (let attempt = 0; attempt <= MAX_SLIDE_RETRIES; attempt++) {
    const res = await client.messages.create({
      model,
      max_tokens: 8000,
      system: systemPrompt,
      messages,
    });
    inTok += res.usage.input_tokens;
    outTok += res.usage.output_tokens;
    const raw = res.content[0].type === "text" ? res.content[0].text : "";
    const outputCode = normalizeSvgRoot(escapeStrayAmpersands(injectCountryKit(injectBrandKit(stripFences(raw)))));

    const soft = validateSvg(outputCode, { ...validateOpts, checkTextOverlap: true, checkContainers: true });
    const hard = validateSvg(outputCode, validateOpts).filter((vv) => !soft.includes(vv));
    const hasLogo = /mm-logo-(white|black)\.png/.test(outputCode);
    if (includeLogo && !hasLogo) {
      hard.push("Missing the Mad Monkey wordmark — embed /mm-logo-white.png or /mm-logo-black.png small at a bottom corner.");
    }
    if (!includeLogo && hasLogo) hard.push("Remove the Mad Monkey wordmark from this slide.");

    // Overlap, text running off the canvas, and overflow are the deck-slide
    // failures people actually notice — they must drive a correction pass, not
    // ship as soft "to eyeball" notes like minor centring estimates.
    const regexFails = soft.filter((v) =>
      /overlap|on top of|cover|collid|safe margin|outside the canvas|off the canvas|overflow|crosses the canvas edge/i.test(v),
    );

    // Pixel audit (warn-only for decks) — run only when the cheap attribute
    // checks are clean, as the final quality gate. It measures the real raster
    // so it catches clipped/covered text the estimates miss. Its high-confidence
    // findings drive ONE more correction pass; everything ships as "to eyeball"
    // notes. It NEVER blocks a slide. Capped so a slow rasterise can't hang.
    let pixFails: string[] = [];
    if (hard.length === 0 && regexFails.length === 0) {
      try {
        const pix = await Promise.race([
          pixelValidate(outputCode, {
            canvas: validateOpts.canvas ?? { w: 1920, h: 1080 },
            edgePad: 36,
            marks: [{ pattern: /mm-logo-(?:white|black)\.png/, name: "Mad Monkey wordmark" }],
          }),
          new Promise<PixelResult>((resolve) =>
            setTimeout(() => resolve({ hard: [], soft: [] }), 25_000),
          ),
        ]);
        pixFails = pix.hard;
        soft.push(...pix.hard, ...pix.soft); // warn-only: all findings become notes
      } catch {
        /* pixel layer is best-effort */
      }
    }
    const layoutFails = [...new Set([...regexFails, ...pixFails])];

    const score = hard.length * 100 + soft.length;
    if (!best || score < best.hard.length * 100 + best.soft.length) {
      best = { code: outputCode, hard, soft };
    }
    if (hard.length === 0 && layoutFails.length === 0) break;
    if (attempt < MAX_SLIDE_RETRIES) {
      messages.push(
        { role: "assistant", content: raw },
        {
          role: "user",
          content: `Fix these issues and return the FULL corrected slide SVG only:\n${[...hard, ...soft].map((x) => `- ${x}`).join("\n")}`,
        },
      );
    }
  }

  best = best ?? { code: "", hard: [], soft: [] };
  return {
    outputCode: best.code,
    notes: [...best.hard, ...best.soft],
    inputTokens: inTok,
    outputTokens: outTok,
  };
}

export const generateDeck = action({
  args: {
    brief: v.string(),
    designSystem: v.string(),
    slideCount: v.optional(v.number()),
  },
  handler: async (ctx, { brief, designSystem, slideCount }): Promise<{ deckId: Id<"decks"> }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.runQuery(api.users.getCurrentUser);
    if (!user?.brandId) throw new Error("No brand assigned.");

    const brandData = await ctx.runQuery(api.brands.getActiveBrandConfig, { slug: "mad-monkey" });
    if (!brandData) throw new Error("No active brand config found.");
    const ds = await ctx.runQuery(internal.generationsInternal.getDesignSystem, {
      brandId: user.brandId,
      name: designSystem,
    });
    const imageManifest = await ctx.runQuery(internal.generationsInternal.getImageManifest, {
      brandId: user.brandId,
    });

    const client = anthropic();

    // 1) Outline (Haiku) — exactly the number of slides the user asked for
    const outline = await composeOutline(client, brief, ds?.description ?? "", slideCount ?? DEFAULT_SLIDES);

    // 2) Create the deck shell (UI shows progress as slides land). The Haiku
    // outline cost is seeded here so it's metered without a junk slide.
    const deckId: Id<"decks"> = await ctx.runMutation(internal.decksInternal.createDeck, {
      userId,
      brandId: user.brandId,
      brandConfigVersion: brandData.config.version,
      title: outline.title,
      brief,
      designSystem,
      slideCount: outline.slides.length,
      inputTokens: outline.inputTokens,
      outputTokens: outline.outputTokens,
      costUsd: outline.inputTokens * (0.8 / 1_000_000) + outline.outputTokens * (4 / 1_000_000),
    });

    // Shared generation setup
    const palette = brandData.config.palette;
    const statedColors = extractStatedColors(brief);
    const allowedColors = [...palette.primary, ...palette.secondary, ...palette.neutral, ...statedColors];
    const allowedFonts = [
      ...new Set([
        brandData.config.fonts.display,
        brandData.config.fonts.body,
        "Bungee",
        ...DISPLAY_FONTS,
        ...ACCENT_FONTS,
      ]),
    ];
    const fmtDim = FORMAT_DIMENSIONS[SLIDE_FORMAT];
    const validateOpts = {
      allowedColors,
      allowedFonts,
      maxLinearGradients: 1,
      allowRadialGradients: false,
      forbidBlur: true,
      canvas: fmtDim ? { w: fmtDim.w, h: fmtDim.h } : undefined,
    } as const;

    try {
      for (let i = 0; i < outline.slides.length; i++) {
        const slide = outline.slides[i];
        const includeLogo = true; // small footer logo on every slide
        const systemPrompt =
          buildSystemPrompt(
            brandData.config,
            ds,
            SLIDE_FORMAT,
            imageManifest,
            { includeLogo, includeAllIn: false, includeAllInMonkey: false },
            statedColors,
          ) +
          "\n\n" +
          COUNTRY_KIT_DOC;
        const result = await generateSlide(
          client,
          systemPrompt,
          slide,
          i,
          outline.slides.length,
          outline.title,
          validateOpts,
          includeLogo,
          MODEL.model,
        );
        await ctx.runMutation(internal.decksInternal.appendSlide, {
          deckId,
          slide: { heading: slide.heading, outputCode: result.outputCode, notes: result.notes },
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.inputTokens * MODEL.inCost + result.outputTokens * MODEL.outCost,
        });
      }
      await ctx.runMutation(internal.decksInternal.finalizeDeck, { deckId, status: "complete" });
    } catch (e) {
      await ctx.runMutation(internal.decksInternal.finalizeDeck, {
        deckId,
        status: "failed",
        error: e instanceof Error ? e.message : "Slide generation failed.",
      });
    }

    return { deckId };
  },
});
