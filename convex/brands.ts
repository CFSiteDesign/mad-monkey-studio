import { query } from "./_generated/server";
import { v } from "convex/values";

export const getActiveBrandConfig = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .filter((q) => q.eq(q.field("isActive"), true))
      .unique();
    if (!brand) return null;

    const config = await ctx.db
      .query("brand_config")
      .withIndex("by_brand", (q) => q.eq("brandId", brand._id))
      .filter((q) => q.eq(q.field("isActive"), true))
      .order("desc")
      .first();

    return config ? { brand, config } : null;
  },
});
