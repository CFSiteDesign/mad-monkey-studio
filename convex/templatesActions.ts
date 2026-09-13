"use node";

// Describe a freshly uploaded reference design with vision: a one-line
// searchable description + a structural layout spec that the generation
// action feeds Claude alongside the image itself.
import { action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import Anthropic from "@anthropic-ai/sdk";
import { internal } from "./_generated/api";
import { TEMPLATE_DESCRIBE_PROMPT, toMediaType } from "../lib/template-replication";

export const describeTemplate = action({
  args: { templateId: v.id("templates") },
  handler: async (ctx, { templateId }): Promise<{ description: string; layoutSpec: string; referenceText: string[] }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
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
    await ctx.runMutation(internal.templates.setTemplateMeta, { templateId, description, layoutSpec, referenceText });
    return { description, layoutSpec, referenceText };
  },
});
