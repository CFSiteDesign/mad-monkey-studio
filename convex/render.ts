"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { svgToPng } from "../lib/resvg-render";

/**
 * Rasterise an SVG to PNG server-side with resvg, which has the brand fonts
 * loaded as buffers — so exports render in Anton/Montserrat/etc. instead of
 * the serif fallback the browser uses when an SVG-as-<img> can't fetch the
 * @import Google Fonts. Returns base64 PNG; the client wraps it into
 * PNG/JPG/PDF/DOCX. No API key involved — pure rasterisation.
 */
export const rasterize = action({
  args: { svg: v.string(), width: v.number() },
  handler: async (ctx, { svg, width }): Promise<{ base64: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    // Images are downscaled during inlining (lib/inline-images), so a normal
    // design is well under this; the cap only guards against a runaway payload.
    if (svg.length > 6_000_000) throw new Error("Design too large to export.");
    const w = Math.min(Math.max(Math.round(width), 64), 4096);
    const png = await svgToPng(svg, w);
    return { base64: png.toString("base64") };
  },
});
