"use node";

// Experience Database (costing tool) integration.
// A STUDIO session opened from the costing tool's ASSET button carries the
// product id; on export we rasterise the design here (brand fonts), keep a copy
// in storage, and POST its URL to the costing tool's asset-callback, signed with
// the shared secret. The costing tool attaches it to the experience row.

import { action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { createHmac } from "node:crypto";
import { svgToPng } from "../lib/resvg-render";

const CALLBACK_URL = "https://avftyexxqyykppzmrjxn.supabase.co/functions/v1/asset-callback";

export const postAsset = action({
  args: {
    svg: v.string(),
    width: v.number(),
    generationId: v.id("generations"),
    productId: v.string(),
  },
  handler: async (ctx, { svg, width, generationId, productId }): Promise<{ ok: boolean; error?: string; url?: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const secret = process.env.MM_ASSET_SECRET;
    if (!secret) return { ok: false, error: "MM_ASSET_SECRET is not set in the Convex environment" };
    if (svg.length > 12_000_000) return { ok: false, error: "Design too large" };
    if (!/^[0-9a-f-]{36}$/i.test(productId)) return { ok: false, error: "bad product id" };

    const w = Math.min(Math.max(Math.round(width), 64), 2048);
    const png = await svgToPng(svg, w);
    // copy into a plain Uint8Array-over-ArrayBuffer: Blob rejects Node's Buffer type
    const bytes = new Uint8Array(new ArrayBuffer(png.byteLength)); bytes.set(png);
    const storageId = await ctx.storage.store(new Blob([bytes], { type: "image/png" }));
    const url = await ctx.storage.getUrl(storageId);
    if (!url) return { ok: false, error: "storage url unavailable" };

    const body = JSON.stringify({ product_id: productId, url, generation_id: generationId });
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    const resp = await fetch(CALLBACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-mm-signature": sig },
      body,
    });
    if (!resp.ok) return { ok: false, error: `callback ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
    return { ok: true, url };
  },
});
