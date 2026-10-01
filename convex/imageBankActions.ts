"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import Anthropic from "@anthropic-ai/sdk";

const DESCRIBE_PROMPT = `Describe this image in one punchy sentence for a brand image search tool. Mad Monkey Hostels — party hostels, Gen Z travellers, Southeast Asia + Australia.

Write what's actually in the shot: action/energy, people (faces, group size), location/setting, lighting/mood. Be specific and concrete.

Good: "rooftop pool party, 10+ young travellers mid-splash and laughing, golden-hour Siem Reap, high energy"
Bad: "group of people at a pool"

One sentence only. No preamble. No full stop at the end.`;

export const describeImage = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Image not found in storage");

    // Fetch the image and convert to base64 — Convex local storage URLs are
    // http:// which Claude's API rejects. Base64 works in all environments.
    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error("Could not fetch image from storage");
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: contentType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: base64 },
            },
            { type: "text", text: DESCRIBE_PROMPT },
          ],
        },
      ],
    });

    return response.content[0].type === "text"
      ? response.content[0].text.trim()
      : "";
  },
});
