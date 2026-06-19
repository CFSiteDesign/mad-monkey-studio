import { internalMutation, internalQuery, query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const slideValidator = v.object({
  heading: v.string(),
  outputCode: v.string(),
  notes: v.optional(v.array(v.string())),
});

// Create the deck shell up front so the UI can show progress as slides land.
export const createDeck = internalMutation({
  args: {
    userId: v.id("users"),
    brandId: v.id("brands"),
    brandConfigVersion: v.number(),
    title: v.string(),
    brief: v.string(),
    designSystem: v.string(),
    slideCount: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("decks", {
      ...args,
      status: "generating",
      slides: [],
      createdAt: Date.now(),
    });
  },
});

// Append one finished slide + roll up token spend (reactive: UI updates live).
export const appendSlide = internalMutation({
  args: {
    deckId: v.id("decks"),
    slide: slideValidator,
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
  },
  handler: async (ctx, { deckId, slide, inputTokens, outputTokens, costUsd }) => {
    const deck = await ctx.db.get(deckId);
    if (!deck) return;
    await ctx.db.patch(deckId, {
      slides: [...deck.slides, slide],
      inputTokens: deck.inputTokens + inputTokens,
      outputTokens: deck.outputTokens + outputTokens,
      costUsd: deck.costUsd + costUsd,
    });
  },
});

export const finalizeDeck = internalMutation({
  args: {
    deckId: v.id("decks"),
    status: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { deckId, status, error }) => {
    await ctx.db.patch(deckId, { status, ...(error ? { error } : {}) });
  },
});

export const getDeckInternal = internalQuery({
  args: { deckId: v.id("decks") },
  handler: async (ctx, { deckId }) => await ctx.db.get(deckId),
});

// Public read for the PPTX export route (Next server can't carry the user's
// Convex auth). Convex IDs are random + unguessable, so this is acceptable for
// the MVP; tighten with a signed token before any sensitive deployment.
export const getDeckForExport = query({
  args: { deckId: v.id("decks") },
  handler: async (ctx, { deckId }) => {
    const deck = await ctx.db.get(deckId);
    if (!deck) return null;
    return {
      title: deck.title,
      status: deck.status,
      slides: deck.slides.filter((s) => s.outputCode).map((s) => s.outputCode),
    };
  },
});

// ── Client-facing (auth-scoped) ────────────────────────────────────────────
export const getDeck = query({
  args: { deckId: v.id("decks") },
  handler: async (ctx, { deckId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const deck = await ctx.db.get(deckId);
    if (!deck || deck.userId !== userId) return null;
    return deck;
  },
});

// Persist a hand "quick fix" to one slide (owner only). The edited SVG replaces
// that slide's outputCode in place — same shape, so no schema change and the
// deck query re-renders the slide reactively. Costs nothing (no tokens).
export const saveSlideEdit = mutation({
  args: {
    deckId: v.id("decks"),
    slideIndex: v.number(),
    outputCode: v.string(),
  },
  handler: async (ctx, { deckId, slideIndex, outputCode }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const deck = await ctx.db.get(deckId);
    if (!deck || deck.userId !== userId) throw new Error("Not your presentation.");
    if (slideIndex < 0 || slideIndex >= deck.slides.length) {
      throw new Error("Slide not found.");
    }

    const trimmed = outputCode.trim();
    if (!trimmed.startsWith("<svg") || !trimmed.endsWith("</svg>")) {
      throw new Error("Edited slide is not a valid SVG.");
    }
    if (trimmed.length > 900_000) {
      throw new Error("Edited slide is too large to save.");
    }

    const slides = deck.slides.map((s, i) =>
      i === slideIndex ? { ...s, outputCode: trimmed } : s,
    );
    await ctx.db.patch(deckId, { slides });
    return { ok: true };
  },
});

// Delete a presentation (owner only).
export const deleteDeck = mutation({
  args: { deckId: v.id("decks") },
  handler: async (ctx, { deckId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const deck = await ctx.db.get(deckId);
    if (deck && deck.userId === userId) await ctx.db.delete(deckId);
  },
});

export const listDecks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const decks = await ctx.db
      .query("decks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(40);
    // Trim slide SVGs from the list payload — the gallery only needs metadata.
    return decks.map((d) => ({
      _id: d._id,
      title: d.title,
      status: d.status,
      slideCount: d.slideCount,
      slidesDone: d.slides.length,
      costUsd: d.costUsd,
      createdAt: d.createdAt,
    }));
  },
});
