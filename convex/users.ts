import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  },
});

// Ensures brandId is set if user was created before seed ran.
export const ensureBrand = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user || user.brandId) return null;

    const brand = await ctx.db
      .query("brands")
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (brand) await ctx.db.patch(user._id, { brandId: brand._id });
  },
});
