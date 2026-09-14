"use node";

// Describe a freshly uploaded reference design with vision: a one-line
// searchable description + a structural layout spec that the generation
// action feeds Claude alongside the image itself.
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import Anthropic from "@anthropic-ai/sdk";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { TEMPLATE_DESCRIBE_PROMPT, toMediaType } from "../lib/template-replication";

type Described = { description: string; layoutSpec: string; referenceText: string[] };

async function describe(ctx: ActionCtx, templateId: Id<"templates">, styleNotes?: string): Promise<Described> {
  const t = await ctx.runQuery(internal.templates.getTemplateInternal, { templateId });
  if (!t) throw new Error("Template not found.");

  const url = await ctx.storage.getUrl(t.referenceStorageId);
  if (!url) throw new Error("Reference image not found.");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not fetch the reference image.");
  const mediaType = toMediaType(res.headers.get("content-type"));
  const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: TEMPLATE_DESCRIBE_PROMPT },
        ],
      },
    ],
  });
  const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
  let description = "";
  let layoutSpec = "";
  let referenceText: string[] = [];
  try {
    const j = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    description = String(j.description ?? "").trim();
    layoutSpec = String(j.layoutSpec ?? "").trim();
    referenceText = Array.isArray(j.words) ? j.words.map((w: unknown) => String(w).trim()).filter(Boolean) : [];
  } catch {
    description = raw.slice(0, 160);
    layoutSpec = raw;
  }
  // Seeded styles carry curated notes on the aesthetic; the vision pass owns
  // the structure, the notes sharpen the mood.
  if (styleNotes?.trim()) layoutSpec = `${layoutSpec}\n\nSTYLE NOTES: ${styleNotes.trim()}`;
  await ctx.runMutation(internal.templates.setTemplateMeta, { templateId, description, layoutSpec, referenceText });
  return { description, layoutSpec, referenceText };
}

export const describeTemplate = action({
  args: { templateId: v.id("templates") },
  handler: async (ctx, { templateId }): Promise<Described> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await describe(ctx, templateId);
  },
});

// CLI-only twin for seeding (no user identity on `npx convex run`).
export const describeTemplateInternal = internalAction({
  args: { templateId: v.id("templates"), styleNotes: v.optional(v.string()) },
  handler: async (ctx, { templateId, styleNotes }): Promise<Described> => {
    return await describe(ctx, templateId, styleNotes);
  },
});
