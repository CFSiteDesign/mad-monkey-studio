import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getDesignSystem = internalQuery({
  args: { brandId: v.id("brands"), name: v.string() },
  handler: async (ctx, { brandId, name }) => {
    return await ctx.db
      .query("design_systems")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .filter((q) => q.eq(q.field("name"), name))
      .first();
  },
});

// ── Image bank manifest: URL + description for every brand image ──
// Injected into Claude's system prompt so it can match briefs to real photos.
export const getImageManifest = internalQuery({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const rows = await ctx.db
      .query("brand_images")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();
    const manifest: { url: string; description: string }[] = [];
    for (const r of rows) {
      const url = await ctx.storage.getUrl(r.storageId);
      if (url) manifest.push({ url, description: r.description });
    }
    return manifest;
  },
});

// ── Spend cap: total USD spent by a user in the given month ("YYYY-MM") ──
export const getMonthSpend = internalQuery({
  args: { userId: v.id("users"), periodMonth: v.string() },
  handler: async (ctx, { userId, periodMonth }) => {
    const rows = await ctx.db
      .query("usage_ledger")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", userId).eq("periodMonth", periodMonth),
      )
      .collect();
    return rows.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  },
});

// ── Rate limit: count this user's generations in the last minute and day ──
export const getRecentGenerationCounts = internalQuery({
  args: { userId: v.id("users"), now: v.number() },
  handler: async (ctx, { userId, now }) => {
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const minuteAgo = now - 60 * 1000;
    const recent = await ctx.db
      .query("generations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.gte(q.field("createdAt"), dayAgo))
      .collect();
    return {
      lastMinute: recent.filter((g) => g.createdAt >= minuteAgo).length,
      lastDay: recent.length,
    };
  },
});

// ── Thread context for conversational refinement ──
// Verifies ownership; returns ordered messages so the action can rebuild
// the conversation for Claude (refine-the-last-design flow).
export const getThreadContext = internalQuery({
  args: { threadId: v.id("threads"), userId: v.id("users") },
  handler: async (ctx, { threadId, userId }) => {
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.userId !== userId || thread.status !== "active") return null;
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    return messages
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => ({ role: m.role, content: m.content }));
  },
});

export const persistGeneration = internalMutation({
  args: {
    userId:             v.id("users"),
    brandId:            v.id("brands"),
    brief:              v.string(),
    outputCode:         v.string(),
    brandConfigVersion: v.number(),
    format:             v.string(),
    designSystem:       v.string(),
    inputTokens:        v.number(),
    outputTokens:       v.number(),
    costUsd:            v.number(),
    threadId:           v.optional(v.id("threads")),
    status:             v.optional(v.string()),          // "complete" (default) | "failed"
    retryCount:         v.optional(v.number()),
    validationErrors:   v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ok = (args.status ?? "complete") === "complete";

    let threadId = args.threadId;
    if (threadId) {
      // Only bump the gallery ordering for designs that actually landed.
      if (ok) await ctx.db.patch(threadId, { updatedAt: now });
    } else {
      threadId = await ctx.db.insert("threads", {
        userId:    args.userId,
        brandId:   args.brandId,
        title:     args.brief.slice(0, 60),
        status:    "active",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Failed generations never enter the conversation — refinements must
    // build on the last on-brand design, and Claude's API requires strict
    // user/assistant alternation.
    if (ok) {
      await ctx.db.insert("messages", {
        threadId,
        userId:    args.userId,
        role:      "user",
        content:   args.brief,
        createdAt: now,
      });
    }

    const generationId = await ctx.db.insert("generations", {
      threadId,
      userId:             args.userId,
      brandId:            args.brandId,
      brandConfigVersion: args.brandConfigVersion,
      prompt:             args.brief,
      outputCode:         args.outputCode,
      renderType:         "png",
      format:             args.format,
      designSystem:       args.designSystem,
      status:             args.status ?? "complete",
      validationErrors:   args.validationErrors,
      retryCount:         args.retryCount ?? 0,
      inputTokens:        args.inputTokens,
      outputTokens:       args.outputTokens,
      costUsd:            args.costUsd,
      createdAt:          now,
    });

    if (ok) {
      await ctx.db.insert("messages", {
        threadId,
        userId:       args.userId,
        role:         "assistant",
        content:      args.outputCode,
        generationId,
        createdAt:    now + 1,
      });
    }

    await ctx.db.insert("usage_ledger", {
      userId:       args.userId,
      brandId:      args.brandId,
      generationId,
      inputTokens:  args.inputTokens,
      outputTokens: args.outputTokens,
      costUsd:      args.costUsd,
      periodMonth:  new Date(now).toISOString().slice(0, 7),
      createdAt:    now,
    });

    return { threadId, generationId };
  },
});

// Minimal generation read for the hand-edit layout audit (runs in a node action).
export const getGenerationForValidation = internalQuery({
  args: { generationId: v.id("generations") },
  handler: async (ctx, { generationId }) => {
    const g = await ctx.db.get(generationId);
    if (!g) return null;
    return { outputCode: g.outputCode, format: g.format };
  },
});

// Attach layout warnings to a generation. `validationErrors` surfaces as the
// "to eyeball" caveat badge in the feed (see threads.ts → notes mapping).
export const setLayoutNotes = internalMutation({
  args: { generationId: v.id("generations"), notes: v.array(v.string()) },
  handler: async (ctx, { generationId, notes }) => {
    await ctx.db.patch(generationId, {
      validationErrors: notes.length ? notes : undefined,
    });
  },
});
