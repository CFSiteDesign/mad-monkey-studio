import { mutation, query } from "./_generated/server";

export const syncUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (identity.name && existing.name !== identity.name) patch.name = identity.name;
      if (identity.email && existing.email !== identity.email) patch.email = identity.email;
      if (Object.keys(patch).length > 0) await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    const brand = await ctx.db
      .query("brands")
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!brand) throw new Error("No active brand found. Run seed first.");

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      email: identity.email ?? "",
      name: identity.name ?? identity.email ?? "Unknown",
      role: "marketer",
      brandId: brand._id,
      monthlyCapUsd: 0,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});
