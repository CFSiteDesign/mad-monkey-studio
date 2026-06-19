import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

/**
 * Persist a human "quick fix" edit as a new version in the chat.
 *
 * The edited SVG joins the thread exactly like an AI generation (new
 * generations row + message pair), so AI refinements and hand-edits live in
 * one history and later refinements build on the hand-edited design. Costs
 * nothing — no tokens involved.
 */
export const saveManualEdit = mutation({
  args: {
    generationId: v.id("generations"), // the version the edit started from
    outputCode: v.string(),
  },
  handler: async (ctx, { generationId, outputCode }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const src = await ctx.db.get(generationId);
    if (!src) throw new Error("Source generation not found.");
    const thread = await ctx.db.get(src.threadId);
    if (!thread || thread.userId !== userId) throw new Error("Not your chat.");

    const trimmed = outputCode.trim();
    if (!trimmed.startsWith("<svg") || !trimmed.endsWith("</svg>")) {
      throw new Error("Edited design is not a valid SVG.");
    }
    if (trimmed.length > 900_000) {
      throw new Error("Edited design is too large to save.");
    }

    const now = Date.now();
    const newGenId = await ctx.db.insert("generations", {
      threadId: src.threadId,
      userId,
      brandId: src.brandId,
      brandConfigVersion: src.brandConfigVersion,
      prompt: "Manual quick-fix edit",
      outputCode: trimmed,
      renderType: src.renderType,
      format: src.format,
      designSystem: src.designSystem,
      status: "complete",
      retryCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      createdAt: now,
    });

    // Mirror the AI flow's message pair so refinement context picks up the
    // hand-edited design as the latest version.
    await ctx.db.insert("messages", {
      threadId: src.threadId,
      userId,
      role: "user",
      content:
        "[Manual quick-fix edit — elements were moved/resized/retyped by hand. Treat this as the current design.]",
      createdAt: now,
    });
    await ctx.db.insert("messages", {
      threadId: src.threadId,
      userId,
      role: "assistant",
      content: trimmed,
      generationId: newGenId,
      createdAt: now + 1,
    });
    await ctx.db.patch(src.threadId, { updatedAt: now });

    // Audit the hand-edit for layout problems (clipped/covered text, off-canvas
    // marks) in the background and attach any findings as "to eyeball" warnings.
    // Runs in a node action (rasteriser); never blocks the save.
    await ctx.scheduler.runAfter(0, internal.editsValidate.validateManualEdit, {
      generationId: newGenId,
    });

    return { generationId: newGenId };
  },
});
