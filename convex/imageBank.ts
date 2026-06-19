import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const MIN_DESCRIPTION_LENGTH = 10;

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

export const addImage = mutation({
  args: {
    storageId: v.id("_storage"),
    description: v.string(),
  },
  handler: async (ctx, { storageId, description }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user?.brandId) throw new Error("No brand assigned.");

    const desc = description.trim();
    if (desc.length < MIN_DESCRIPTION_LENGTH) {
      throw new Error(
        "Description is required (10+ characters) — it's how Claude matches your image to a brief.",
      );
    }

    return await ctx.db.insert("brand_images", {
      brandId: user.brandId,
      uploadedBy: userId,
      storageId,
      description: desc,
      createdAt: Date.now(),
    });
  },
});

export const listImages = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user?.brandId) return [];

    const rows = await ctx.db
      .query("brand_images")
      .withIndex("by_brand", (q) => q.eq("brandId", user.brandId!))
      .order("desc")
      .collect();

    const isAdmin = user.role === "admin";
    return Promise.all(
      rows.map(async (r) => {
        const uploader = await ctx.db.get(r.uploadedBy);
        return {
          id: r._id,
          url: await ctx.storage.getUrl(r.storageId),
          description: r.description,
          uploaderName: uploader?.name ?? "Unknown",
          canDelete: r.uploadedBy === userId || isAdmin,
          createdAt: r.createdAt,
        };
      }),
    );
  },
});

export const deleteUpload = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.storage.delete(storageId);
  },
});

export const deleteImage = mutation({
  args: { imageId: v.id("brand_images") },
  handler: async (ctx, { imageId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    const img = await ctx.db.get(imageId);
    if (!img) return;
    if (img.uploadedBy !== userId && user?.role !== "admin") {
      throw new Error("You can only delete images you uploaded.");
    }
    try { await ctx.storage.delete(img.storageId); } catch { /* already gone */ }
    await ctx.db.delete(imageId);
  },
});
