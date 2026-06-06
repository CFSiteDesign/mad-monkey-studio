import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db.get(identity.subject as Id<"users">);
  },
});

// Ensures brandId is set if user was created before seed ran.
export const ensureBrand = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db.get(identity.subject as Id<"users">);
    if (!user || user.brandId) return null;

    const brand = await ctx.db
      .query("brands")
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (brand) await ctx.db.patch(user._id, { brandId: brand._id });
  },
});
