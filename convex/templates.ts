// Templates — approved reference designs GMs create from.
//
// Marketing (role "marketing") and admins upload an inspiration/reference
// image, it sits as "pending" (invisible to GMs) until one of them approves
// it, then GMs pick from the approved set. All gates are server-side.
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const isApproverRole = (role: string | undefined | null) =>
  role === "admin" || role === "marketing";

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!user?.brandId) throw new Error("No brand assigned.");
  if (user.isActive === false) throw new Error("Account is disabled.");
  return { userId, user, brandId: user.brandId as Id<"brands"> };
}

async function requireApprover(ctx: QueryCtx | MutationCtx) {
  const r = await requireUser(ctx);
  if (!isApproverRole(r.user.role)) throw new Error("Only the marketing team can manage templates.");
  return r;
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireApprover(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// Create a PENDING template from an uploaded reference image. The describe
// action fills in description + layoutSpec right after.
export const createTemplate = mutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
    format: v.string(),
    designSystem: v.string(),
  },
  handler: async (ctx, { storageId, name, format, designSystem }) => {
    const { userId, brandId } = await requireApprover(ctx);
    const clean = name.trim();
    if (clean.length < 2) throw new Error("Give the template a name.");
    return await ctx.db.insert("templates", {
      brandId,
      name: clean,
      description: "",
      referenceStorageId: storageId,
      format,
      designSystem,
      status: "pending",
      createdBy: userId,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

export const setTemplateMeta = internalMutation({
  args: {
    templateId: v.id("templates"),
    description: v.string(),
    layoutSpec: v.string(),
    referenceText: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { templateId, description, layoutSpec, referenceText }) => {
    await ctx.db.patch(templateId, { description, layoutSpec, ...(referenceText ? { referenceText } : {}) });
  },
});

export const approveTemplate = mutation({
  args: { templateId: v.id("templates") },
  handler: async (ctx, { templateId }) => {
    const { userId, brandId } = await requireApprover(ctx);
    const t = await ctx.db.get(templateId);
    if (!t || t.brandId !== brandId) throw new Error("Template not found.");
    await ctx.db.patch(templateId, { status: "approved", approvedBy: userId, approvedAt: Date.now() });
  },
});

export const rejectTemplate = mutation({
  args: { templateId: v.id("templates") },
  handler: async (ctx, { templateId }) => {
    const { brandId } = await requireApprover(ctx);
    const t = await ctx.db.get(templateId);
    if (!t || t.brandId !== brandId) throw new Error("Template not found.");
    await ctx.db.patch(templateId, { status: "rejected", approvedBy: undefined, approvedAt: undefined });
  },
});

// Retire an approved template (keeps history; GMs stop seeing it) or delete
// outright — deleting also drops the stored reference image.
export const deleteTemplate = mutation({
  args: { templateId: v.id("templates") },
  handler: async (ctx, { templateId }) => {
    const { brandId } = await requireApprover(ctx);
    const t = await ctx.db.get(templateId);
    if (!t || t.brandId !== brandId) throw new Error("Template not found.");
    await ctx.storage.delete(t.referenceStorageId).catch(() => {});
    await ctx.db.delete(templateId);
  },
});

export const renameTemplate = mutation({
  args: { templateId: v.id("templates"), name: v.string() },
  handler: async (ctx, { templateId, name }) => {
    const { brandId } = await requireApprover(ctx);
    const t = await ctx.db.get(templateId);
    if (!t || t.brandId !== brandId) throw new Error("Template not found.");
    await ctx.db.patch(templateId, { name: name.trim() || t.name });
  },
});

// Everyone sees approved templates; approvers also see pending + rejected.
export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { templates: [], canManage: false };
    const user = await ctx.db.get(userId);
    if (!user?.brandId) return { templates: [], canManage: false };
    const canManage = isApproverRole(user.role);
    const rows = await ctx.db
      .query("templates")
      .withIndex("by_brand", (q) => q.eq("brandId", user.brandId!))
      .order("desc")
      .collect();
    const visible = rows.filter((t) => t.isActive && (canManage || t.status === "approved"));
    const templates = await Promise.all(
      visible.map(async (t) => ({
        _id: t._id,
        name: t.name,
        description: t.description,
        format: t.format,
        designSystem: t.designSystem,
        status: t.status,
        createdAt: t.createdAt,
        createdBy: t.createdBy,
        approvedBy: t.approvedBy ?? null,
        imageUrl: await ctx.storage.getUrl(t.referenceStorageId),
      })),
    );
    return { templates, canManage };
  },
});

// For the generation action: the template regardless of status (the action
// enforces approved-only for GMs).
export const getTemplateInternal = internalQuery({
  args: { templateId: v.id("templates") },
  handler: async (ctx, { templateId }) => await ctx.db.get(templateId),
});
