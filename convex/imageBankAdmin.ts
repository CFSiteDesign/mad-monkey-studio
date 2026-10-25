// Photo analysis for the image bank (Oct 2026). Internal only: driven by
// `scripts/analyze-bank.mjs` (macOS Vision, run from Charlie's Mac with
// `npx convex run … [--prod]`) and by the upload-time estimate in
// imageBankActions.analyzeUpload. Nothing here is callable from the client.
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const box = v.object({ x0: v.number(), y0: v.number(), x1: v.number(), y1: v.number() });
const band = v.object({ y0: v.number(), y1: v.number(), x0: v.optional(v.number()), x1: v.optional(v.number()) });

/** Every bank photo with its URL and whether Vision has analysed it yet. */
export const listForAnalysis = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("brand_images").collect();
    const out: { id: string; url: string; description: string; analysisSource: string | null }[] = [];
    for (const r of rows) {
      const url = await ctx.storage.getUrl(r.storageId);
      if (url) out.push({ id: r._id, url, description: r.description, analysisSource: r.analysisSource ?? null });
    }
    return out;
  },
});

/** Upload URL for a cut-out PNG. */
export const analysisUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

/** Store analysis for one photo; replaces (and deletes) any previous cut-out. */
export const setAnalysis = internalMutation({
  args: {
    imageId: v.id("brand_images"),
    source: v.string(), // "vision" | "claude"
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    subjectBox: v.optional(box),
    faceBand: v.optional(band),
    cutoutStorageId: v.optional(v.id("_storage")),
    cutoutWidth: v.optional(v.number()),
    cutoutHeight: v.optional(v.number()),
    cutoutSliced: v.optional(v.string()),
    hasText: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const row = await ctx.db.get(a.imageId);
    if (!row) return { ok: false, reason: "missing" };
    // A rough upload-time estimate never overwrites a precise Vision analysis.
    if (a.source === "claude" && row.analysisSource === "vision") return { ok: false, reason: "has-vision" };
    if (row.cutoutStorageId && row.cutoutStorageId !== a.cutoutStorageId && a.source === "vision") {
      await ctx.storage.delete(row.cutoutStorageId).catch(() => {});
    }
    await ctx.db.patch(a.imageId, {
      analysisSource: a.source,
      width: a.width,
      height: a.height,
      subjectBox: a.subjectBox,
      faceBand: a.faceBand,
      ...(a.hasText !== undefined ? { hasText: a.hasText } : {}),
      ...(a.source === "vision"
        ? { cutoutStorageId: a.cutoutStorageId, cutoutWidth: a.cutoutWidth, cutoutHeight: a.cutoutHeight, cutoutSliced: a.cutoutSliced }
        : {}),
    });
    return { ok: true };
  },
});
