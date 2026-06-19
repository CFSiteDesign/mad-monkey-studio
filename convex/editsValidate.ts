"use node";

// Layout audit for hand-edited (Quick Fix) versions. Quick Fix saves are not
// AI-validated, so a manual drag/resize can clip a headline off the canvas or
// drop a sticker over text. This runs the same pixel audit the AI loop uses and
// attaches the findings as "to eyeball" warnings on the version — it never
// blocks the save (the edit is already the user's choice), it just surfaces what
// changed so it's caught before export. Scheduled from edits.saveManualEdit.

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { pixelValidate } from "../lib/pixel-validate";
import { FORMAT_DIMENSIONS } from "../lib/prompt";

export const validateManualEdit = internalAction({
  args: { generationId: v.id("generations") },
  handler: async (ctx, { generationId }) => {
    const gen = await ctx.runQuery(
      internal.generationsInternal.getGenerationForValidation,
      { generationId },
    );
    if (!gen) return;
    const dim = FORMAT_DIMENSIONS[gen.format];
    if (!dim) return;

    let notes: string[] = [];
    try {
      // Hard cap so a slow rasterise can never hang the scheduler job.
      const pixel = await Promise.race([
        pixelValidate(gen.outputCode, {
          canvas: { w: dim.w, h: dim.h },
          edgePad: 36,
          marks: [
            { pattern: /mm-logo-(?:white|black)\.png/, name: "Mad Monkey wordmark" },
            { pattern: /mm-allin\.png/, name: "ALL IN sticker" },
            { pattern: /mm-allin-monkey\.png/, name: "ALL IN Mad Monkey Hostels sticker" },
          ],
        }),
        new Promise<{ hard: string[]; soft: string[] }>((resolve) =>
          setTimeout(() => resolve({ hard: [], soft: [] }), 25_000),
        ),
      ]);
      // Warn-only: clipped/covered (hard) and margin/centring (soft) all become
      // visible caveats on the hand-edited version.
      notes = [...pixel.hard, ...pixel.soft];
    } catch {
      /* pixel layer is best-effort — leave the version unflagged on failure */
    }

    await ctx.runMutation(internal.generationsInternal.setLayoutNotes, {
      generationId,
      notes,
    });
  },
});
