// Seeding helpers for the built-in "style" templates (the 25 poster styles).
// Internal only: driven by `scripts/seed-style-templates.mjs` through
// `npx convex run`, never from the client. Each style is upserted by name as
// an APPROVED template on the active brand, credited to the first admin.
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const seedUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const upsertStyleTemplate = internalMutation({
  args: {
    name: v.string(),
    storageId: v.id("_storage"),
    format: v.string(),
    designSystem: v.string(),
    description: v.string(),
  },
  handler: async (ctx, { name, storageId, format, designSystem, description }) => {
    const brand = await ctx.db
      .query("brands")
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();
    if (!brand) throw new Error("No active brand.");
    const owner =
      (await ctx.db.query("users").filter((q) => q.eq(q.field("role"), "admin")).first()) ??
      (await ctx.db.query("users").first());
    if (!owner) throw new Error("No users yet: sign in once before seeding.");

    const now = Date.now();
    const rows = await ctx.db
      .query("templates")
      .withIndex("by_brand", (q) => q.eq("brandId", brand._id))
      .collect();
    const existing = rows.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());

    if (existing) {
      if (existing.referenceStorageId !== storageId) {
        await ctx.storage.delete(existing.referenceStorageId).catch(() => {});
      }
      await ctx.db.patch(existing._id, {
        referenceStorageId: storageId,
        format,
        designSystem,
        description,
        status: "approved",
        isActive: true,
        approvedBy: owner._id,
        approvedAt: now,
      });
      return { templateId: existing._id, updated: true };
    }
    const templateId = await ctx.db.insert("templates", {
      brandId: brand._id,
      name: name.trim(),
      description,
      referenceStorageId: storageId,
      format,
      designSystem,
      status: "approved",
      createdBy: owner._id,
      approvedBy: owner._id,
      approvedAt: now,
      isActive: true,
      createdAt: now,
    });
    return { templateId, updated: false };
  },
});
