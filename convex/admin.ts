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
      role: args.role === "admin" ? "admin" : "user",
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
      role: args.role === "admin" ? "admin" : "user",
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
    await ctx.db.patch(userId, { monthlyCapUsd: Math.max(0, Math.round(monthlyCapUsd)) });
  },
});

// Promote/demote a member. Admins can invite others; users can't.
export const setUserRole = mutation({
  args: { userId: v.id("users"), role: v.string() },
  handler: async (ctx, { userId, role }) => {
    const adminId = await requireAdmin(ctx);
    if (userId === adminId) throw new Error("You can't change your own role.");
    await ctx.db.patch(userId, { role: role === "admin" ? "admin" : "user" });
  },
});

export const listInvites = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("invites").order("desc").take(100);
  },
});

// Everything the in-app Members admin page needs: all signed-up members of this
// brand + the invites that haven't signed up yet.
export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    const adminId = await requireAdmin(ctx);
    const admin = await ctx.db.get(adminId);
    const brandId = admin?.brandId;

    const allUsers = await ctx.db.query("users").collect();
    const users = allUsers.filter((u) => !brandId || u.brandId === brandId);
    const emails = new Set(users.map((u) => (u.email ?? "").toLowerCase()));

    const invites = await ctx.db.query("invites").order("desc").take(200);
    const pending = invites.filter(
      (inv) => (!brandId || inv.brandId === brandId) && !emails.has(inv.email.toLowerCase()),
    );

    return {
      meId: adminId,
      users: users.map((u) => ({
        _id: u._id,
        email: u.email ?? "",
        name: u.name ?? "",
        role: u.role === "admin" ? "admin" : "user",
        monthlyCapUsd: u.monthlyCapUsd ?? DEFAULT_CAP_USD,
        isActive: u.isActive ?? true,
      })),
      pending: pending.map((p) => ({
        _id: p._id,
        email: p.email,
        role: p.role === "admin" ? "admin" : "user",
        monthlyCapUsd: p.monthlyCapUsd ?? DEFAULT_CAP_USD,
      })),
    };
  },
});

// ── Admin usage dashboard ──────────────────────────────────────────────────
// Everyone's spend at a glance: per-person month/all-time spend, creation
// counts, average cost per creation, cap usage, plus brand-wide totals and a
// format breakdown. Spend covers BOTH single creations (generations table) and
// presentations (decks table), which each carry their own cost.
export const usageOverview = query({
  args: {},
  handler: async (ctx) => {
    const adminId = await requireAdmin(ctx);
    const admin = await ctx.db.get(adminId);
    const brandId = admin?.brandId;
    const periodMonth = new Date(Date.now()).toISOString().slice(0, 7); // "YYYY-MM"
    const inMonth = (ts: number) => new Date(ts).toISOString().slice(0, 7) === periodMonth;

    const members = (await ctx.db.query("users").collect()).filter(
      (u) => !brandId || u.brandId === brandId,
    );
    const gens = brandId
      ? await ctx.db.query("generations").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect()
      : await ctx.db.query("generations").collect();
    const decks = (await ctx.db.query("decks").collect()).filter(
      (d) => !brandId || d.brandId === brandId,
    );

    type Agg = {
      gens: number; completed: number; failed: number; decks: number;
      spendAll: number; tokensAll: number; spendMonth: number; unitsMonth: number; lastAt: number;
    };
    const blank = (): Agg => ({ gens: 0, completed: 0, failed: 0, decks: 0, spendAll: 0, tokensAll: 0, spendMonth: 0, unitsMonth: 0, lastAt: 0 });
    const by = new Map<string, Agg>();
    const bucket = (id: unknown): Agg => {
      const k = String(id);
      let e = by.get(k);
      if (!e) { e = blank(); by.set(k, e); }
      return e;
    };

    for (const g of gens) {
      const e = bucket(g.userId);
      e.gens++;
      if (g.status === "complete") e.completed++;
      else if (g.status === "failed") e.failed++;
      e.spendAll += g.costUsd ?? 0;
      e.tokensAll += (g.inputTokens ?? 0) + (g.outputTokens ?? 0);
      if (inMonth(g.createdAt)) { e.spendMonth += g.costUsd ?? 0; e.unitsMonth++; }
      if (g.createdAt > e.lastAt) e.lastAt = g.createdAt;
    }
    for (const d of decks) {
      const e = bucket(d.userId);
      e.decks++;
      if (d.status === "complete") e.completed++;
      else if (d.status === "failed") e.failed++;
      e.spendAll += d.costUsd ?? 0;
      e.tokensAll += (d.inputTokens ?? 0) + (d.outputTokens ?? 0);
      if (inMonth(d.createdAt)) { e.spendMonth += d.costUsd ?? 0; e.unitsMonth++; }
      if (d.createdAt > e.lastAt) e.lastAt = d.createdAt;
    }

    const rows = members
      .map((u) => {
        const e = by.get(String(u._id)) ?? blank();
        const cap = u.monthlyCapUsd ?? DEFAULT_CAP_USD;
        const units = e.gens + e.decks;
        return {
          userId: u._id,
          name: u.name ?? "",
          email: u.email ?? "",
          role: u.role === "admin" ? "admin" : "user",
          capUsd: cap,
          monthSpendUsd: e.spendMonth,
          monthUnits: e.unitsMonth,
          capPct: cap > 0 ? Math.min(100, (e.spendMonth / cap) * 100) : 0,
          allTimeSpendUsd: e.spendAll,
          generations: e.gens,
          decks: e.decks,
          completed: e.completed,
          failed: e.failed,
          tokens: e.tokensAll,
          avgCostUsd: units > 0 ? e.spendAll / units : 0,
          lastActiveAt: e.lastAt || null,
        };
      })
      .sort((a, b) => b.allTimeSpendUsd - a.allTimeSpendUsd);

    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
    const allUnits = sum((r) => r.generations + r.decks);
    const allSpend = sum((r) => r.allTimeSpendUsd);

    // Format breakdown (generations carry a format; decks are 16:9 presentations).
    const fmt = new Map<string, { count: number; spend: number }>();
    for (const g of gens) {
      const e = fmt.get(g.format) ?? { count: 0, spend: 0 };
      e.count++; e.spend += g.costUsd ?? 0; fmt.set(g.format, e);
    }
    if (decks.length) {
      const e = fmt.get("presentation") ?? { count: 0, spend: 0 };
      for (const d of decks) { e.count++; e.spend += d.costUsd ?? 0; }
      fmt.set("presentation", e);
    }
    const byFormat = [...fmt.entries()]
      .map(([format, e]) => ({ format, count: e.count, spendUsd: e.spend, avgCostUsd: e.count ? e.spend / e.count : 0 }))
      .sort((a, b) => b.count - a.count);

    return {
      periodMonth,
      memberCount: rows.length,
      activeThisMonth: rows.filter((r) => r.monthUnits > 0).length,
      totals: {
        monthSpendUsd: sum((r) => r.monthSpendUsd),
        monthUnits: sum((r) => r.monthUnits),
        allTimeSpendUsd: allSpend,
        units: allUnits,
        generations: sum((r) => r.generations),
        decks: sum((r) => r.decks),
        completed: sum((r) => r.completed),
        failed: sum((r) => r.failed),
        tokens: sum((r) => r.tokens),
        avgCostUsd: allUnits > 0 ? allSpend / allUnits : 0,
      },
      members: rows,
      byFormat,
    };
  },
});

// ── Admin: view one member's creations ─────────────────────────────────────
// The designs + presentations a given user has made, so an admin can click a
// name on the usage dashboard and see their actual output. One entry per
// thread (latest version), mirroring that user's own gallery.
export const userCreations = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const adminId = await requireAdmin(ctx);
    const admin = await ctx.db.get(adminId);
    const brandId = admin?.brandId;
    const target = await ctx.db.get(userId);
    if (!target || (brandId && target.brandId && target.brandId !== brandId)) {
      throw new Error("User not found in your brand.");
    }

    const gens = await ctx.db
      .query("generations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Latest generation per thread = one "creation" (matches the gallery).
    const latest = new Map<string, (typeof gens)[number]>();
    for (const g of gens) {
      const k = String(g.threadId);
      const cur = latest.get(k);
      if (!cur || g.createdAt > cur.createdAt) latest.set(k, g);
    }
    const creations = [...latest.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 60)
      .map((g) => ({
        id: g._id,
        outputCode: g.outputCode ?? "",
        format: g.format,
        designSystem: g.designSystem,
        status: g.status,
        costUsd: g.costUsd ?? 0,
        createdAt: g.createdAt,
        prompt: (g.prompt ?? "").slice(0, 140),
      }));

    const decks = (
      await ctx.db
        .query("decks")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30)
      .map((d) => ({
        id: d._id,
        title: d.title,
        status: d.status,
        slideCount: d.slideCount,
        costUsd: d.costUsd ?? 0,
        createdAt: d.createdAt,
        thumb: d.slides?.[0]?.outputCode ?? "",
      }));

    return {
      name: target.name ?? "",
      email: target.email ?? "",
      role: target.role === "admin" ? "admin" : "user",
      creationCount: creations.length,
      deckCount: decks.length,
      creations,
      decks,
    };
  },
});
