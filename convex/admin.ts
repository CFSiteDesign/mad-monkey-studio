import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

const DEFAULT_CAP_USD = 50;

async function firstActiveBrandId(ctx: {
  db: { query: (t: "brands") => any };
}): Promise<Id<"brands">> {
  const brand = await ctx.db
    .query("brands")
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();
  if (!brand) throw new Error("No active brand. Run the seed first.");
  return brand._id;
}

// ── Owner-only: callable from the Convex CLI / dashboard (deployment access) ──
// `npx convex run admin:createInvite '{"email":"x@y.com","role":"marketer"}'`
export const createInvite = internalMutation({
  args: {
    email: v.string(),
    role: v.optional(v.string()),          // default "marketer"
    monthlyCapUsd: v.optional(v.number()), // default $50
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const brandId = await firstActiveBrandId(ctx);

    // Idempotent: if an unused invite exists, return it.
    const existing = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) => q.eq(q.field("usedAt"), undefined))
      .first();
    if (existing) return { inviteId: existing._id, email, status: "already-invited" };

    const inviteId = await ctx.db.insert("invites", {
      email,
      role: args.role ?? "marketer",
      brandId,
      monthlyCapUsd: args.monthlyCapUsd ?? DEFAULT_CAP_USD,
      createdAt: Date.now(),
    });
    return { inviteId, email, status: "invited" };
  },
});

// ── Bootstrap the first admin (CLI only) ──
// `npx convex run admin:bootstrapAdmin '{"email":"charlie@madmonkeyhostels.com"}'`
export const bootstrapAdmin = internalMutation({
  args: { email: v.string(), monthlyCapUsd: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!user) throw new Error(`No user with email ${email}. They must sign in once first.`);
    await ctx.db.patch(user._id, {
      role: "admin",
      monthlyCapUsd: args.monthlyCapUsd ?? DEFAULT_CAP_USD,
    });
    return { userId: user._id, role: "admin" };
  },
});

// ── Auth-gated admin actions (for a future in-app admin UI) ──
async function requireAdmin(ctx: any): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (user?.role !== "admin") throw new Error("Admin only.");
  return userId;
}

export const inviteUser = mutation({
  args: {
    email: v.string(),
    role: v.optional(v.string()),
    monthlyCapUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const adminId = await requireAdmin(ctx);
    const admin = await ctx.db.get(adminId);
    const email = args.email.trim().toLowerCase();

    const existing = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) => q.eq(q.field("usedAt"), undefined))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("invites", {
      email,
      role: args.role ?? "marketer",
      brandId: admin!.brandId!,
      monthlyCapUsd: args.monthlyCapUsd ?? DEFAULT_CAP_USD,
      createdBy: adminId,
      createdAt: Date.now(),
    });
  },
});

export const setUserCap = mutation({
  args: { userId: v.id("users"), monthlyCapUsd: v.number() },
  handler: async (ctx, { userId, monthlyCapUsd }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { monthlyCapUsd });
  },
});

export const listInvites = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("invites").order("desc").take(100);
  },
});
