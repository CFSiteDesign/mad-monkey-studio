"use node";

// ⚠️ DEV ONLY — generate one asset for a given brief/format/tier WITHOUT auth,
// so we can run a controlled Sonnet-vs-Opus comparison from the CLI. Mirrors the
// generateAsset loop (build prompt → generate → validate → 1 retry) but skips
// auth, persistence, rate limits, and metering.
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildSystemPrompt,
  stripFences,
  FORMAT_DIMENSIONS,
  DISPLAY_FONTS,
  ACCENT_FONTS,
} from "../lib/prompt";
import { validateSvg, extractStatedColors, escapeStrayAmpersands } from "../lib/validate";
import { injectBrandKit } from "../lib/brand-kit";
import { injectCountryKit, COUNTRY_KIT_DOC } from "../lib/country-kit";
import { svgToPng } from "../lib/resvg-render";

// ⚠️ DEV ONLY — inline a comparison SVG's images and rasterise it to a PNG
// (resvg = correct brand fonts) so it can be embedded in a PowerPoint.
async function inlineForRender(svg: string, dbg: string[]): Promise<string> {
  const hrefs = new Set<string>();
  for (const m of svg.matchAll(/(?:xlink:)?href\s*=\s*"([^"]+)"/gi)) {
    const h = m[1];
    if (h && !h.startsWith("data:") && !h.startsWith("#")) hrefs.add(h);
  }
  for (const href of hrefs) {
    const url = href.startsWith("/") ? `http://127.0.0.1:3000${href}` : href;
    try {
      const r = await fetch(url);
      if (!r.ok) {
        dbg.push(`${href.slice(0, 50)} -> HTTP ${r.status}`);
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      const mime =
        r.headers.get("content-type") || (href.match(/\.jpe?g$/i) ? "image/jpeg" : "image/png");
      svg = svg.split(`"${href}"`).join(`"data:${mime};base64,${buf.toString("base64")}"`);
      dbg.push(`${href.slice(0, 50)} -> OK ${buf.length}b ${mime}`);
    } catch (e) {
      dbg.push(`${href.slice(0, 50)} -> ERR ${e instanceof Error ? e.message : "?"}`);
    }
  }
  return svg;
}

export const devRenderPng = internalAction({
  args: { svg: v.string(), width: v.optional(v.number()), debug: v.optional(v.boolean()) },
  handler: async (_ctx, { svg, width, debug }): Promise<{ png: string; dbg?: string[] }> => {
    const dbg: string[] = [];
    const png = await svgToPng(await inlineForRender(svg, dbg), width ?? 800);
    return { png: png.toString("base64"), ...(debug ? { dbg } : {}) };
  },
});

const TIERS = {
  standard: { model: "claude-sonnet-4-6", inCost: 3 / 1_000_000, outCost: 15 / 1_000_000 },
  extra: { model: "claude-opus-4-8", inCost: 5 / 1_000_000, outCost: 25 / 1_000_000 },
} as const;
const MAX_RETRIES = 1;

export const devGenerate = internalAction({
  args: {
    brief: v.string(),
    format: v.string(),
    designSystem: v.string(),
    tier: v.string(),
  },
  handler: async (
    ctx,
    { brief, format, designSystem, tier: tierArg },
  ): Promise<{
    svg: string;
    model: string;
    format: string;
    designSystem: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    retries: number;
    hardCount: number;
    softCount: number;
    notes: string[];
  }> => {
    const t = tierArg === "extra" ? TIERS.extra : TIERS.standard;
    const brandData = await ctx.runQuery(api.brands.getActiveBrandConfig, { slug: "mad-monkey" });
    if (!brandData) throw new Error("no brand config");
    const brandId = brandData.brand._id;
    const ds = await ctx.runQuery(internal.generationsInternal.getDesignSystem, {
      brandId,
      name: designSystem,
    });
    const imageManifest = await ctx.runQuery(internal.generationsInternal.getImageManifest, {
      brandId,
    });

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
    const fmtDim = FORMAT_DIMENSIONS[format];
    const systemPrompt =
      buildSystemPrompt(
        brandData.config,
        ds,
        format,
        imageManifest,
        { includeLogo: true, includeAllIn: false, includeAllInMonkey: false },
        statedColors,
      ) +
      (format === "16:9" ? "\n\n" + COUNTRY_KIT_DOC : "");
    const validateOpts = {
      allowedColors,
      allowedFonts,
      maxLinearGradients: 1,
      allowRadialGradients: false,
      forbidBlur: true,
      canvas: fmtDim ? { w: fmtDim.w, h: fmtDim.h } : undefined,
    } as const;

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      timeout: 160_000,
      maxRetries: 1,
    });
    const messages: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: brief },
    ];
    let best: { code: string; hard: string[]; soft: string[] } | null = null;
    let inTok = 0;
    let outTok = 0;
    let retries = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await client.messages.create({
        model: t.model,
        max_tokens: 8000,
        system: systemPrompt,
        messages,
      });
      inTok += res.usage.input_tokens;
      outTok += res.usage.output_tokens;
      const raw = res.content[0].type === "text" ? res.content[0].text : "";
      const outputCode = escapeStrayAmpersands(injectCountryKit(injectBrandKit(stripFences(raw))));
      const soft = validateSvg(outputCode, { ...validateOpts, checkTextOverlap: true, checkContainers: true });
      const hard = validateSvg(outputCode, validateOpts).filter((vv) => !soft.includes(vv));
      if (!/mm-logo-(white|black)\.png/.test(outputCode)) {
        hard.push("missing logo");
      }
      const score = hard.length * 100 + soft.length;
      if (!best || score < best.hard.length * 100 + best.soft.length) best = { code: outputCode, hard, soft };
      if (hard.length === 0) break;
      if (attempt < MAX_RETRIES) {
        retries = attempt + 1;
        messages.push(
          { role: "assistant", content: raw },
          { role: "user", content: `Fix these and return the full corrected SVG only:\n${[...hard, ...soft].join("\n")}` },
        );
      }
    }

    best = best ?? { code: "", hard: [], soft: [] };
    return {
      svg: best.code,
      model: t.model,
      format,
      designSystem,
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd: +(inTok * t.inCost + outTok * t.outCost).toFixed(4),
      retries,
      hardCount: best.hard.length,
      softCount: best.soft.length,
      notes: [...best.hard, ...best.soft].slice(0, 6),
    };
  },
});
