import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const DEFAULT_CAP_USD = 50;

/** Essential account stats for the signed-in user: media created,
 *  tokens used and spend against the monthly cap. */
export const myStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const periodMonth = new Date(Date.now()).toISOString().slice(0, 7); // "YYYY-MM"

    // This month — from the usage ledger (source of truth for billing)
    const monthRows = await ctx.db
      .query("usage_ledger")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", userId).eq("periodMonth", periodMonth),
      )
      .collect();

    const monthSpendUsd = monthRows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    const monthInputTokens = monthRows.reduce((s, r) => s + (r.inputTokens ?? 0), 0);
    const monthOutputTokens = monthRows.reduce((s, r) => s + (r.outputTokens ?? 0), 0);

    // All time — from generations
    const allGens = await ctx.db
      .query("generations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const allTimeSpendUsd = allGens.reduce((s, g) => s + (g.costUsd ?? 0), 0);
    const allTimeTokens = allGens.reduce(
      (s, g) => s + (g.inputTokens ?? 0) + (g.outputTokens ?? 0),
      0,
    );

    const recent = [...allGens]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6)
      .map((g) => ({
        id: g._id,
        format: g.format,
        designSystem: g.designSystem,
        costUsd: g.costUsd,
        tokens: (g.inputTokens ?? 0) + (g.outputTokens ?? 0),
        status: g.status,
        createdAt: g.createdAt,
      }));

    // This month's failed runs — surfaced so a failure isn't an invisible
    // "+1 media created, nothing in the gallery".
    const failedThisMonth = allGens.filter(
      (g) =>
        g.status === "failed" &&
        new Date(g.createdAt).toISOString().slice(0, 7) === periodMonth,
    );
    const lastFailReason =
      [...failedThisMonth].sort((a, b) => b.createdAt - a.createdAt)[0]
        ?.validationErrors?.[0] ?? null;

    return {
      email: user.email,
      name: user.name,
      role: user.role,
      periodMonth,
      capUsd: user.monthlyCapUsd ?? DEFAULT_CAP_USD,
      month: {
        generations: monthRows.length,
        failed: failedThisMonth.length,
        inputTokens: monthInputTokens,
        outputTokens: monthOutputTokens,
        spendUsd: monthSpendUsd,
      },
      lastFailReason,
      allTime: {
        generations: allGens.length,
        tokens: allTimeTokens,
        spendUsd: allTimeSpendUsd,
      },
      recent,
    };
  },
});
