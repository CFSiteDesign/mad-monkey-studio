import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Squash a brief down to a ≤6-word caption for the gallery. */
function sixWords(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const clipped = words.slice(0, 6).join(" ");
  return words.length > 6 ? `${clipped}…` : clipped;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const active = threads
      .filter((t) => t.status === "active")
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const tiles = await Promise.all(
      active.map(async (t) => {
        const gens = await ctx.db
          .query("generations")
          .withIndex("by_thread", (q) => q.eq("threadId", t._id))
          .collect();
        // Only on-brand output makes the gallery — failed runs stay hidden.
        const latest =
          gens
            .filter((g) => g.status === "complete")
            .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
        if (!latest) return null;
        return {
          id: t._id,
          caption: sixWords(t.title),
          updatedAt: t.updatedAt,
          thumbnail: latest.outputCode,
          format: latest.format,
        };
      }),
    );
    return tiles.filter((t) => t !== null);
  },
});

export const get = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.userId !== userId) return null;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();

    const briefs = messages
      .filter((m) => m.role === "user")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => ({ id: m._id, content: m.content, createdAt: m.createdAt }));

    const gens = await ctx.db
      .query("generations")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    // Full version history, oldest → newest — every on-brand generation in
    // the chat stays viewable and exportable.
    const complete = gens
      .filter((g) => g.status === "complete")
      .sort((a, b) => a.createdAt - b.createdAt);

    return {
      id: thread._id,
      title: thread.title,
      briefs,
      generations: complete.map((g) => ({
        id: g._id,
        outputCode: g.outputCode,
        format: g.format,
        designSystem: g.designSystem,
        inputTokens: g.inputTokens,
        outputTokens: g.outputTokens,
        costUsd: g.costUsd,
        retryCount: g.retryCount,
        notes: g.validationErrors,
        isManualEdit: g.prompt === "Manual quick-fix edit",
      })),
    };
  },
});

export const archive = mutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.userId !== userId) throw new Error("Not your chat.");
    await ctx.db.patch(threadId, { status: "archived", updatedAt: Date.now() });
  },
});
