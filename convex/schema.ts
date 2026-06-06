import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // ── Tenants ──────────────────────────────────────────────────────────────
  brands: defineTable({
    name: v.string(),
    slug: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
    isActive: v.boolean(),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),

  brand_config: defineTable({
    brandId: v.id("brands"),
    version: v.number(),
    palette: v.object({
      primary: v.array(v.string()),
      secondary: v.array(v.string()),
      neutral: v.array(v.string()),
    }),
    fonts: v.object({
      display: v.string(),
      body: v.string(),
      allowedWeights: v.array(v.number()),
    }),
    formats: v.array(v.string()),
    designSystems: v.array(v.string()),
    claudeMd: v.string(),
    isActive: v.boolean(),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_brand_version", ["brandId", "version"]),

  // ── Design Systems & Templates ────────────────────────────────────────────
  design_systems: defineTable({
    brandId: v.id("brands"),
    name: v.string(),
    description: v.string(),
    baseCssVars: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
  }).index("by_brand", ["brandId"]),

  templates: defineTable({
    brandId: v.id("brands"),
    designSystemId: v.id("design_systems"),
    name: v.string(),
    format: v.string(),
    outputType: v.string(),
    templateCode: v.string(),
    description: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_design_system", ["designSystemId"]),

  // ── Conversation ──────────────────────────────────────────────────────────
  threads: defineTable({
    userId: v.id("users"),
    brandId: v.id("brands"),
    title: v.string(),
    status: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"]),

  messages: defineTable({
    threadId: v.id("threads"),
    userId: v.id("users"),
    role: v.string(),
    content: v.string(),
    generationId: v.optional(v.id("generations")),
    createdAt: v.number(),
  }).index("by_thread", ["threadId"]),

  // ── Generations ───────────────────────────────────────────────────────────
  generations: defineTable({
    threadId: v.id("threads"),
    userId: v.id("users"),
    brandId: v.id("brands"),
    brandConfigVersion: v.number(),
    prompt: v.string(),
    outputCode: v.string(),
    renderStorageId: v.optional(v.id("_storage")),
    renderType: v.string(),
    format: v.string(),
    designSystem: v.string(),
    status: v.string(),
    validationErrors: v.optional(v.array(v.string())),
    retryCount: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"]),

  // ── Metering ──────────────────────────────────────────────────────────────
  usage_ledger: defineTable({
    userId: v.id("users"),
    brandId: v.id("brands"),
    generationId: v.id("generations"),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
    periodMonth: v.string(),
    createdAt: v.number(),
  })
    .index("by_user_month", ["userId", "periodMonth"])
    .index("by_brand_month", ["brandId", "periodMonth"]),

  // ── Users (extends authTables' users with app-specific fields) ────────────
  users: defineTable({
    // Convex Auth fields (managed by authTables, extended here)
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // App-specific fields
    role: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
    monthlyCapUsd: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    createdAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_brand", ["brandId"]),
});
