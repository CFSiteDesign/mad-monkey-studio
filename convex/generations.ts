"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, stripFences, FORMAT_DIMENSIONS, DISPLAY_FONTS, ACCENT_FONTS } from "../lib/prompt";
import { validateSvg, extractStatedColors, escapeStrayAmpersands, normalizeSvgRoot } from "../lib/validate";
import { pixelValidate, type PixelResult } from "../lib/pixel-validate";
import { injectBrandKit } from "../lib/brand-kit";

// Single generation model: Opus 4.8 ($5/1M input, $25/1M output) — the most
// capable model, far better at dense on-brand layout. (Sonnet/quality tiers
// were removed; brief/outline composition still uses cheap Haiku separately.)
const MODEL = { model: "claude-opus-4-8", inCost: 5 / 1_000_000, outCost: 25 / 1_000_000 } as const;

// Standard per-user rate limits.
const RATE_PER_MINUTE = 10;
const RATE_PER_DAY    = 200;
const DEFAULT_CAP_USD = 50; // applied when a user has no explicit cap

// Validation gate: off-brand output is rejected and regenerated.
const MAX_VALIDATION_RETRIES = 3;
// Soft (layout-estimate) violations get at most this many correction attempts
// before shipping best-effort — hard brand breaks still get the full budget.
const SOFT_RETRY_LIMIT = 1;

// ── Wordmark / ALL IN sticker overlap check (best-effort AABB) ──
// Parses plain x/y/width/height off both <image> tags and tests their
// bounding boxes with a 40px buffer. Skips silently when an element uses
// transforms we can't resolve — the prompt rule still applies.
function imageRect(svg: string, href: RegExp): { x: number; y: number; w: number; h: number } | null {
  const tag = svg.match(new RegExp(`<image[^>]*${href.source}[^>]*>`))?.[0]
           ?? svg.match(new RegExp(`<image(?:[^>]*)>`, "g"))?.find((t) => href.test(t));
  if (!tag || /transform\s*=/.test(tag)) return null;
  const attr = (name: string) => {
    const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([\\d.]+)["']`));
    return m ? parseFloat(m[1]) : null;
  };
  const w = attr("width");
  if (w === null) return null;
  // height="auto" is common for the wordmark — fall back to its real ratio (~0.3)
  const h = attr("height") ?? w * 0.3;
  return { x: attr("x") ?? 0, y: attr("y") ?? 0, w, h };
}

const STICKERS: Array<[RegExp, string]> = [
  [/mm-allin\.png/, "ALL IN sticker"],
  [/mm-allin-monkey\.png/, "ALL IN monkey-head sticker"],
];

// All three brand marks, with friendly names for messages.
const BRAND_MARKS: Array<[RegExp, string]> = [
  [/mm-logo-(?:white|black)\.png/, "Mad Monkey wordmark"],
  [/mm-allin\.png/, "ALL IN sticker"],
  [/mm-allin-monkey\.png/, "ALL IN Mad Monkey Hostels sticker"],
];

const MARK_EDGE_PAD = 36; // min px every brand mark must keep from each edge

/**
 * Absolute bounding box of a brand-mark <image>, resolving translate(...) and
 * inflating for any rotate(...) (a ±15° rect AABB grows by ≈0.26× the cross
 * dimension). Returns null only when width/height are missing.
 */
function markBox(
  svg: string,
  href: RegExp,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const tag =
    svg.match(new RegExp(`<image[^>]*${href.source}[^>]*>`))?.[0] ??
    svg.match(/<image(?:[^>]*)>/g)?.find((t) => href.test(t));
  if (!tag) return null;
  const num = (name: string) => {
    const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["'](-?[\\d.]+)["']`));
    return m ? parseFloat(m[1]) : null;
  };
  const w = num("width");
  if (w === null) return null;
  const h = num("height") ?? w * 0.3; // height="auto" → wordmark ratio
  let x = num("x") ?? 0;
  let y = num("y") ?? 0;
  const tr = tag.match(/translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/);
  if (tr) {
    x += parseFloat(tr[1]);
    y += parseFloat(tr[2]);
  }
  const rotated = /rotate\(/.test(tag);
  const mx = rotated ? 0.26 * h : 0;
  const my = rotated ? 0.26 * w : 0;
  return { x1: x - mx, y1: y - my, x2: x + w + mx, y2: y + h + my };
}

/** Every brand mark must sit fully inside the canvas with corner padding. */
function markOverflowViolations(svg: string, canvas: { w: number; h: number }): string[] {
  const out: string[] = [];
  const P = MARK_EDGE_PAD;
  for (const [pattern, name] of BRAND_MARKS) {
    const b = markBox(svg, pattern);
    if (!b) continue;
    if (b.x1 < P || b.y1 < P || b.x2 > canvas.w - P || b.y2 > canvas.h - P) {
      out.push(
        `The ${name} overhangs or sits too close to the canvas edge — anchor it inside a corner with at least ${P}px padding on EVERY side so its full box (including rotation) stays on-canvas. It must never bleed past any edge.`,
      );
    }
  }
  return out;
}

function brandMarksOverlap(svg: string): string | null {
  const logo = imageRect(svg, /mm-logo-(?:white|black)\.png/);
  if (!logo) return null;
  const GAP = 40;
  for (const [pattern, name] of STICKERS) {
    const st = imageRect(svg, pattern);
    if (!st) continue;
    const apart =
      st.x + st.w + GAP < logo.x ||
      logo.x + logo.w + GAP < st.x ||
      st.y + st.h + GAP < logo.y ||
      logo.y + logo.h + GAP < st.y;
    if (!apart) {
      return `The ${name} overlaps (or sits too close to) the Mad Monkey wordmark — move the sticker well clear of the bottom-right logo zone (≥60px separation).`;
    }
  }
  return null;
}

// Geometric layout checks are estimates that can misfire; classify their
// messages as SOFT so they degrade to a best-effort note instead of a hard
// failure. Exact checks (colour/font/blur/gradient/marks/viewBox) stay HARD.
const SOFT_PATTERNS = [
  /overlaps/i,
  /overflows its pill/i,
  /not (horizontally|vertically) centred/i,
  /empty starburst/i,
  /sits too close/i,
  /on top of text/i,
  /decorative image/i,
  /runs off the canvas/i,
  /corner region/i,
  /panel\/box/i,
  /overhangs or sits too close to the canvas edge/i,
  /covering the text/i,
  /PIXEL CHECK/,
  /is stretched/i,
];
const isSoftViolation = (v: string) => SOFT_PATTERNS.some((p) => p.test(v));

const correctionPrompt = (violations: string[]) =>
  `BRAND VALIDATION FAILED. Your previous SVG broke these non-negotiable rules:
${violations.map((v) => `- ${v}`).join("\n")}

Regenerate the COMPLETE corrected SVG for the same brief. Fix every violation listed. Keep the concept and layout — change only what the violations require. Return ONLY the raw SVG.`;

export const generateAsset = action({
  args: {
    brief:         v.string(),
    format:        v.string(),
    designSystem:  v.string(),
    threadId:           v.optional(v.id("threads")),
    includeLogo:        v.optional(v.boolean()),
    includeAllIn:       v.optional(v.boolean()),
    includeAllInMonkey: v.optional(v.boolean()),
    includeStamp:       v.optional(v.boolean()),
  },
  // Explicit return type breaks the api self-reference cycle (ctx.runQuery(api…)
  // inside an action whose own type is part of `api`) that otherwise degrades
  // every generated type to `any`.
  handler: async (ctx, args): Promise<{
    outputCode: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    retryCount: number;
    notes?: string[];
    generationId: Id<"generations">;
    threadId: Id<"threads">;
  }> => {
    const { brief, format, designSystem, threadId } = args;
    const includeLogo        = args.includeLogo        ?? true;
    const includeAllIn       = args.includeAllIn       ?? true;
    const includeAllInMonkey = args.includeAllInMonkey ?? false;
    const includeStamp       = args.includeStamp       ?? false;
    // Auth — Convex Auth subject is "<userId>|<sessionId>"; use the helper.
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Load user + brand config
    const user = await ctx.runQuery(api.users.getCurrentUser);
    if (!user?.brandId) throw new Error("No brand assigned. Run seed first.");
    if (user.isActive === false) throw new Error("Account is disabled. Contact an admin.");

    // ── Gate 1: rate limit (before any paid work) ──
    const now = Date.now();
    const counts = await ctx.runQuery(
      internal.generationsInternal.getRecentGenerationCounts,
      { userId, now },
    );
    if (counts.lastMinute >= RATE_PER_MINUTE) {
      throw new Error("Rate limit: too many generations this minute. Wait a moment and retry.");
    }
    if (counts.lastDay >= RATE_PER_DAY) {
      throw new Error("Daily generation limit reached. Try again tomorrow or ask an admin.");
    }

    // ── Gate 2: monthly spend cap (0 = unlimited) ──
    const periodMonth = new Date(now).toISOString().slice(0, 7);
    const cap = user.monthlyCapUsd ?? DEFAULT_CAP_USD;
    if (cap > 0) {
      const spent = await ctx.runQuery(internal.generationsInternal.getMonthSpend, {
        userId,
        periodMonth,
      });
      if (spent >= cap) {
        throw new Error(
          `Monthly spend cap of $${cap.toFixed(2)} reached ($${spent.toFixed(2)} used). Resets next month.`,
        );
      }
    }

    const brandData = await ctx.runQuery(api.brands.getActiveBrandConfig, {
      slug: "mad-monkey",
    });
    if (!brandData) throw new Error("No active brand config found. Run seed first.");

    // Load design system guidelines (lives in generationsInternal — no "use node")
    const ds = await ctx.runQuery(internal.generationsInternal.getDesignSystem, {
      brandId: user.brandId,
      name:    designSystem,
    });

    // Community image bank — descriptions let Claude match photos to the brief
    const imageManifest = await ctx.runQuery(
      internal.generationsInternal.getImageManifest,
      { brandId: user.brandId },
    );

    // ── Conversational refinement: rebuild the thread history ──
    // Earlier SVGs are replaced with a placeholder so only the most recent
    // design is re-sent in full — keeps refinement context cheap.
    const messages: { role: "user" | "assistant"; content: string }[] = [];
    if (threadId) {
      const history = await ctx.runQuery(
        internal.generationsInternal.getThreadContext,
        { threadId, userId },
      );
      if (!history) throw new Error("Chat not found.");
      const lastAssistantIdx = history.map((m) => m.role).lastIndexOf("assistant");
      history.forEach((m, i) => {
        messages.push({
          role: m.role === "assistant" ? "assistant" : "user",
          content:
            m.role === "assistant" && i !== lastAssistantIdx
              ? "[earlier design omitted — superseded by the latest version below]"
              : m.content,
        });
      });
    }
    messages.push({ role: "user", content: brief });

    // Colours the marketer explicitly named across this thread's briefs become
    // permitted exceptions to the brand palette (hex codes + CSS colour words).
    const statedColors = [
      ...new Set(
        messages
          .filter((m) => m.role === "user")
          .flatMap((m) => extractStatedColors(m.content)),
      ),
    ];

    // Build the constrained system prompt
    const systemPrompt = buildSystemPrompt(
      brandData.config,
      ds,
      format,
      imageManifest,
      { includeLogo, includeAllIn, includeAllInMonkey, includeStamp },
      statedColors,
    );

    // ── Validation gate: generate → validate → auto-correct (hard gate) ──
    const palette = brandData.config.palette;
    const allowedColors = [
      ...palette.primary,
      ...palette.secondary,
      ...palette.neutral,
      ...statedColors,
    ];
    // Bungee is the sticker-accent font; DISPLAY_FONTS are the matched
    // headline faces (Anton / Archivo Black / Titan One / Baloo 2 / Montserrat).
    const allowedFonts = [
      ...new Set([
        brandData.config.fonts.display,
        brandData.config.fonts.body,
        "Bungee",
        ...DISPLAY_FONTS,
        ...ACCENT_FONTS,
      ]),
    ];

    // Hard per-request timeout + single SDK retry so a network stall can never
    // hang a generation indefinitely (the validation loop adds its own retries).
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      timeout: 110_000,
      maxRetries: 1,
    });
    const fmtDim = FORMAT_DIMENSIONS[format];
    const bankUrls = new Set(imageManifest.map((i: { url: string }) => i.url));

    // Starbursts default to the top-right corner — but if any brief in this
    // thread explicitly positions one ("starburst bottom left"), the brief
    // wins and the placement check is waived. Never-over-text still applies.
    const allBriefs = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ")
      .toLowerCase();
    const starburstAnywhere =
      /star\s*burst/.test(allBriefs) &&
      /\b(top|bottom|left|right|centre|center|middle|corner)\b/.test(allBriefs);

    let inputTokens  = 0;
    let outputTokens = 0;
    let retryCount   = 0;
    // Keep the best attempt seen (fewest hard, then fewest soft) so we never
    // leave the user empty-handed after a paid generation.
    let best: { code: string; hard: string[]; soft: string[] } | null = null;

    for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
      const response = await anthropic.messages.create({
        model:      MODEL.model,
        // Dense collage SVGs (grain, sawtooth badges, stickers) regularly run
        // past 4k output tokens — a low cap truncates mid-file, cutting off
        // the brand marks (drawn last) and forcing pointless retries.
        max_tokens: 16000,
        // The system prompt (brand rules + image manifest, ~5k tokens) is
        // identical across retries and generations — cache it so retries pay
        // ~10% input cost and start faster.
        system: [
          { type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } },
        ],
        messages,
      });

      const raw        = response.content[0].type === "text" ? response.content[0].text : "";
      // Inject the canonical craft kit (filters/patterns/shapes + fonts),
      // stripping any hand-drawn copies, so every output has guaranteed-correct
      // primitives. Then escape stray & so strict XML consumers (pixel
      // validation, Quick fix, SVG-as-img export) accept the document.
      const outputCode = normalizeSvgRoot(escapeStrayAmpersands(injectBrandKit(stripFences(raw))));
      inputTokens  += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      let soft: string[] = [];
      const hard: string[] = [];

      // Truncated output is useless — flag it and skip the validators
      // (no point measuring half an SVG, and pixel validation costs ~1.5s).
      const truncated =
        response.stop_reason === "max_tokens" ||
        !outputCode.trimEnd().endsWith("</svg>");
      if (truncated) {
        hard.push(
          "The SVG was cut off before completion — it must be a COMPLETE document ending in </svg>. Be more economical: reuse <defs>, avoid repeated filter definitions, keep decorative paths short, and don't repeat near-identical elements.",
        );
      } else {
      // Geometric layout checks (overlap / overflow / centring) are estimates
      // and can misfire — treat them as SOFT. Exact brand checks below are HARD.
      soft = validateSvg(outputCode, {
        allowedColors,
        allowedFonts,
        maxLinearGradients:   1,
        allowRadialGradients: false,
        forbidBlur:           true,
        checkTextOverlap:     true,
        checkContainers:      true,
        starburstAnywhere,
        canvas:               fmtDim ? { w: fmtDim.w, h: fmtDim.h } : undefined,
      }).filter(isSoftViolation);

      hard.push(...validateSvg(outputCode, {
        allowedColors,
        allowedFonts,
        maxLinearGradients:   1,
        allowRadialGradients: false,
        forbidBlur:           true,
      }).filter((v) => !isSoftViolation(v)));

      // Brand marks: enforce exactly what the user ticked (HARD).
      const hasLogo        = /mm-logo-(white|black)\.png/.test(outputCode);
      const hasAllIn       = /mm-allin\.png/.test(outputCode);
      const hasAllInMonkey = /mm-allin-monkey\.png/.test(outputCode);
      const hasStamp       = /mm-stamp\.png/.test(outputCode);
      if (includeLogo && !hasLogo) {
        hard.push(
          "Missing the Mad Monkey wordmark — embed /mm-logo-white.png (dark background) or /mm-logo-black.png (light background) at bottom-right.",
        );
      }
      if (!includeLogo && hasLogo) {
        hard.push("The Mad Monkey wordmark was excluded for this asset — remove the mm-logo image.");
      }
      if (includeAllIn && !hasAllIn) {
        hard.push("Missing the ALL IN sticker — embed /mm-allin.png rotated ±5–15°, clear of the wordmark.");
      }
      if (!includeAllIn && hasAllIn) {
        hard.push("The ALL IN sticker was excluded for this asset — remove /mm-allin.png.");
      }
      if (includeAllInMonkey && !hasAllInMonkey) {
        hard.push("Missing the ALL IN monkey-head sticker — embed /mm-allin-monkey.png rotated ±5–15°, clear of the wordmark.");
      }
      if (!includeAllInMonkey && hasAllInMonkey) {
        hard.push("The ALL IN monkey-head sticker was excluded for this asset — remove /mm-allin-monkey.png.");
      }
      if (includeStamp && !hasStamp) {
        hard.push("Missing the Mad Monkey Stamp — embed /mm-stamp.png as a circular badge, clear of the wordmark and all text.");
      }
      if (!includeStamp && hasStamp) {
        hard.push("The Mad Monkey Stamp was excluded for this asset — remove /mm-stamp.png.");
      }
      // Marks getting too close is a layout estimate → SOFT.
      if (hasLogo && (hasAllIn || hasAllInMonkey)) {
        const overlap = brandMarksOverlap(outputCode);
        if (overlap) soft.push(overlap);
      }
      // Brand marks bleeding off the canvas edge → SOFT (drives retries).
      if (fmtDim) {
        for (const v of markOverflowViolations(outputCode, { w: fmtDim.w, h: fmtDim.h })) {
          soft.push(v);
        }
      }
      // Pixel-level audit: rasterises the SVG so rotated/transformed layouts
      // are measured for real — covered text, clipped text, marks off-canvas.
      // Best-effort: any failure (fonts, rasteriser) silently falls back to
      // the attribute checks above.
      if (fmtDim) {
        try {
          // Hard overall cap so the pixel layer can NEVER hang a generation,
          // whatever happens inside (font fetch, rasteriser). On timeout we
          // ship with the attribute checks only.
          // The pixel audit measures the REAL raster, so its high-confidence
          // failures (text clipped off-canvas, text/marks covered, marks
          // bleeding past an edge) are HARD — they block the asset and get the
          // full retry budget. Margin/centring nudges stay SOFT.
          const pixel = await Promise.race([
            pixelValidate(outputCode, {
              canvas: { w: fmtDim.w, h: fmtDim.h },
              edgePad: 36,
              marks: [
                { pattern: /mm-logo-(?:white|black)\.png/, name: "Mad Monkey wordmark" },
                { pattern: /mm-allin\.png/, name: "ALL IN sticker" },
                { pattern: /mm-allin-monkey\.png/, name: "ALL IN Mad Monkey Hostels sticker" },
                { pattern: /mm-stamp\.png/, name: "Mad Monkey Stamp" },
              ],
            }),
            new Promise<PixelResult>((resolve) =>
              setTimeout(() => resolve({ hard: [], soft: [] }), 25_000),
            ),
          ]);
          hard.push(...pixel.hard);
          soft.push(...pixel.soft);
        } catch {
          /* pixel layer is best-effort */
        }
      }
      // Hallucinated image URLs render as blank/black boxes (HARD).
      for (const im of outputCode.matchAll(
        /<image\b[^>]*?(?:xlink:)?href\s*=\s*["']([^"']+)["']/gi,
      )) {
        const href = im[1];
        if (href.startsWith("data:")) continue;
        if (/^\/mm-(logo-(white|black)|allin|allin-monkey|stamp)\.png$/.test(href)) continue;
        if (!bankUrls.has(href)) {
          hard.push(
            `Image href "${href.slice(0, 70)}" is not a real asset — it renders as a blank box. Use ONLY exact URLs from the IMAGE BANK list, or /mm-logo-white.png, /mm-logo-black.png, /mm-allin.png, /mm-allin-monkey.png, /mm-stamp.png. If no bank image fits, use flat graphic shapes instead.`,
          );
        }
      }
      // Exact canvas declaration — wrong/missing viewBox breaks scaling (HARD).
      if (
        fmtDim &&
        !new RegExp(`viewBox\\s*=\\s*["']0 0 ${fmtDim.w} ${fmtDim.h}["']`).test(outputCode)
      ) {
        hard.push(
          `The <svg> must declare exactly: width="${fmtDim.w}" height="${fmtDim.h}" viewBox="0 0 ${fmtDim.w} ${fmtDim.h}".`,
        );
      }
      } // end !truncated

      // Track best-so-far (prefer fewer hard, then fewer soft).
      const score = hard.length * 100 + soft.length;
      const bestScore = best ? best.hard.length * 100 + best.soft.length : Infinity;
      if (score < bestScore) best = { code: outputCode, hard, soft };

      if (hard.length === 0 && soft.length === 0) break;

      // Retry policy: HARD brand breaks (off-palette, wrong font, missing mark)
      // get the full retry budget. SOFT layout notes (overlap/margin/centring
      // estimates) only get ONE correction attempt — a dense collage rarely
      // hits zero soft notes, and chasing it burned all 4 Sonnet calls (the
      // 3–5 min wait). Soft notes ship as a best-effort "to eyeball" caveat.
      const onlySoft = hard.length === 0;
      if (onlySoft && attempt >= SOFT_RETRY_LIMIT) break; // accept best-effort

      retryCount = attempt + 1;
      if (attempt < MAX_VALIDATION_RETRIES) {
        messages.push(
          { role: "assistant", content: raw },
          { role: "user", content: correctionPrompt([...hard, ...soft]) },
        );
      }
    }

    best = best ?? { code: "", hard: ["No output produced."], soft: [] };
    const outputCode    = best.code;
    const hardRemaining = best.hard;
    const softRemaining = best.soft;
    const costUsd = inputTokens * MODEL.inCost + outputTokens * MODEL.outCost;
    // Hard violations are exact brand breaks (off-palette, wrong font, missing
    // mark, bad canvas) — those never ship. Soft layout notes ship as a
    // best-effort asset with a visible caveat rather than failing outright.
    const status = hardRemaining.length === 0 ? "complete" : "failed";
    const violations = [...hardRemaining, ...softRemaining];

    // Persist (mutation lives in generationsInternal — no "use node")
    const persistResult = await ctx.runMutation(
      internal.generationsInternal.persistGeneration,
      {
        userId,
        brandId:            user.brandId,
        brief,
        outputCode,
        brandConfigVersion: brandData.config.version,
        format,
        designSystem,
        inputTokens,
        outputTokens,
        costUsd,
        threadId,
        status,
        retryCount,
        validationErrors: violations.length ? violations : undefined,
      },
    ) as { threadId: Id<"threads">; generationId: Id<"generations"> };

    // Only a genuine brand break (wrong colour/font, missing mark, bad canvas)
    // blocks the asset. Tokens were spent and logged either way.
    if (status === "failed") {
      throw new Error(
        `Couldn't lock this one on-brand after ${MAX_VALIDATION_RETRIES + 1} attempts. ` +
          `Sticking points: ${hardRemaining.slice(0, 3).join(" · ")} — tweak the brief and go again.`,
      );
    }

    return {
      outputCode,
      inputTokens,
      outputTokens,
      costUsd,
      retryCount,
      notes: softRemaining.length ? softRemaining : undefined,
      generationId: persistResult.generationId,
      threadId:     persistResult.threadId,
    };
  },
});
