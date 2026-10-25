"use node";

import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
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

/** Pixel size from the file header (JPEG / PNG / WebP / GIF), no decoding. */
function imageSize(b: Buffer): { width: number; height: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 10 && b.toString("ascii", 0, 3) === "GIF") return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.length > 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const n = b.readUInt32LE(21);
      return { width: 1 + (n & 0x3fff), height: 1 + ((n >> 14) & 0x3fff) };
    }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

const ANALYZE_PROMPT = `Look at this photo and return JSON only, no prose:
{"faces": {"x0":0..1,"y0":0..1,"x1":0..1,"y1":0..1} or null, "subject": {"x0":0..1,"y0":0..1,"x1":0..1,"y1":0..1} or null}
"faces" = the box that just contains the main people's faces (ignore tiny background faces), as fractions of the image width/height from the top-left. null if no clear faces.
"subject" = the box around the main subject (the people and what they hold or ride). null if there is no clear subject.`;

/** Upload-time estimate of face band + subject box (Claude vision). Never
 *  overwrites a precise Vision analysis (imageBankAdmin.setAnalysis). */
export const analyzeUpload = internalAction({
  args: { imageId: v.id("brand_images") },
  handler: async (ctx, { imageId }) => {
    const rows = await ctx.runQuery(internal.imageBankAdmin.listForAnalysis, {});
    const row = rows.find((r) => r.id === imageId);
    if (!row || row.analysisSource === "vision") return;
    const res = await fetch(row.url);
    if (!res.ok) return;
    const buf = Buffer.from(await res.arrayBuffer());
    const size = imageSize(buf);
    const mediaType = (res.headers.get("content-type") ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    const clamp = (n: unknown) => Math.max(0, Math.min(1, Number(n)));
    let faces: { x0: number; y0: number; x1: number; y1: number } | null = null;
    let subject: { x0: number; y0: number; x1: number; y1: number } | null = null;
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
      const out = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: buf.toString("base64") } },
          { type: "text", text: ANALYZE_PROMPT },
        ] }],
      });
      const text = out.content.filter((b) => b.type === "text").map((b) => (b.type === "text" ? b.text : "")).join("");
      const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      const box = (o: { x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown } | null) =>
        o && o.x1 != null && o.y1 != null ? { x0: clamp(o.x0), y0: clamp(o.y0), x1: clamp(o.x1), y1: clamp(o.y1) } : null;
      faces = box(j.faces);
      subject = box(j.subject);
    } catch {
      /* best effort: size alone still helps the layout */
    }
    await ctx.runMutation(internal.imageBankAdmin.setAnalysis, {
      imageId,
      source: "claude",
      ...(size ? { width: size.width, height: size.height } : {}),
      ...(subject ? { subjectBox: subject } : {}),
      ...(faces ? { faceBand: { y0: faces.y0, y1: faces.y1, x0: faces.x0, x1: faces.x1 } } : {}),
    });
  },
});
