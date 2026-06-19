import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { injectBrandKit } from "../lib/brand-kit";

// ⚠️ DEV ONLY — insert a 2-slide test deck (no Claude calls) to verify the
// gallery, presentation view, and .pptx export end-to-end for free.
const SLIDE = (bg: string, headline: string, sub: string) =>
  injectBrandKit(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
<rect width="1920" height="1080" fill="${bg}"/>
<text x="140" y="480" font-family="Anton" font-size="170" fill="#0a0a0a" paint-order="stroke" stroke="#0a0a0a" stroke-width="6">${headline}</text>
<rect x="140" y="560" width="900" height="92" fill="#ffffff"/>
<text x="170" y="606" dominant-baseline="central" font-family="Montserrat" font-weight="900" font-size="40" fill="#0a0a0a" letter-spacing="2">${sub}</text>
<image href="/mm-logo-black.png" x="1640" y="980" width="150" height="46"/>
</svg>`);

export const insertTestDeck = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase()))
      .first();
    if (!user?.brandId) throw new Error("no user");
    const now = Date.now();
    return await ctx.db.insert("decks", {
      userId: user._id,
      brandId: user.brandId,
      brandConfigVersion: 1,
      title: "Bali Expansion (test)",
      brief: "test deck",
      designSystem: "internal",
      status: "complete",
      slides: [
        { heading: "BALI EXPANSION", outputCode: SLIDE("#ff01aa", "GO ALL IN", "MAD MONKEY ULUWATU"), notes: [] },
        { heading: "THE NUMBERS", outputCode: SLIDE("#00fef3", "3 PROPERTIES", "KOH RONG · ULUWATU · EL NIDO"), notes: [] },
      ],
      slideCount: 2,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      createdAt: now,
    });
  },
});

// ⚠️ DEV ONLY — probe the most recent generation's SVG for font/size diagnostics.
export const latestGenProbe = internalQuery({
  args: {},
  handler: async (ctx) => {
    const g = await ctx.db.query("generations").order("desc").take(4);
    const gen = g.find((x) => x.outputCode && x.outputCode.length > 200) ?? g[0];
    if (!gen) return { none: true };
    const svg = gen.outputCode;
    const body = svg.replace(/<defs[\s\S]*?<\/defs>/gi, "");
    const samples: string[] = [];
    for (const m of body.matchAll(/<text\b([^>]*)>([^<]{1,18})/gi)) {
      const a = m[1];
      const ff = (a.match(/font-family\s*=\s*["']([^"']+)["']/i) || [, "?"])[1];
      const fw = (a.match(/font-weight\s*=\s*["']([^"']+)["']/i) || [, "-"])[1];
      samples.push(`${ff} / ${fw} :: ${m[2].trim().slice(0, 16)}`);
      if (samples.length >= 10) break;
    }
    return {
      prompt: gen.prompt.slice(0, 50),
      svgBytes: svg.length,
      hasInlinedData: /href="data:/.test(svg),
      imageHrefs: (svg.match(/<image[^>]*href="([^"]+)"/gi) || []).length,
      textSamples: samples,
      svg,
    };
  },
});

// Average / total cost across real (billed) generations.
export const costStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const gens = await ctx.db.query("generations").collect();
    const real = gens.filter((g) => g.costUsd > 0 || g.outputTokens > 0);
    const n = real.length;
    const sum = (f: (g: (typeof real)[number]) => number) =>
      real.reduce((a, g) => a + (f(g) || 0), 0);
    const totalCost = sum((g) => g.costUsd);
    const totalIn = sum((g) => g.inputTokens);
    const totalOut = sum((g) => g.outputTokens);
    return {
      generations: n,
      avgCostUsd: n ? +(totalCost / n).toFixed(4) : 0,
      totalCostUsd: +totalCost.toFixed(4),
      avgInputTokens: n ? Math.round(totalIn / n) : 0,
      avgOutputTokens: n ? Math.round(totalOut / n) : 0,
      avgRetries: n ? +(sum((g) => g.retryCount ?? 0) / n).toFixed(2) : 0,
      minCostUsd: n ? +Math.min(...real.map((g) => g.costUsd)).toFixed(4) : 0,
      maxCostUsd: n ? +Math.max(...real.map((g) => g.costUsd)).toFixed(4) : 0,
    };
  },
});

// ⚠️ DEV ONLY — inject a representative on-brand poster into a user's gallery
// so Quick Fix / export can be tested without spending generation tokens.
// `npx convex run devseed:insertTestGeneration '{"email":"dev-test@madmonkey.local"}'`
const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
<defs>
<style>@import url('https://fonts.googleapis.com/css2?family=Anton&amp;family=Montserrat:wght@400;600;900&amp;display=swap');</style>
<filter id="hs"><feOffset dx="7" dy="7"/><feFlood flood-color="#0a0a0a"/><feComposite operator="in" in2="SourceGraphic"/></filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0"/></filter>
</defs>
<rect width="1080" height="1350" fill="#ff01aa"/>
<g transform="translate(540 560) scale(1.6)"><use href="#mm-star12" color="#ffc000"/><text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-family="Anton" font-size="34" fill="#0a0a0a">SAT 9PM</text></g>
<text x="540" y="200" text-anchor="middle" font-size="180" font-family="Anton" fill="#ffc000" paint-order="stroke" stroke="#0a0a0a" stroke-width="14" stroke-linejoin="round" letter-spacing="-4">FOAM PARTY</text>
<g transform="translate(250 760) rotate(-7)"><rect x="-180" y="-60" width="360" height="120" fill="#0a0a0a"/><text x="0" y="-18" text-anchor="middle" dominant-baseline="central" font-size="30" font-family="Montserrat" font-weight="900" fill="#00fef3">FREE</text><text x="0" y="22" text-anchor="middle" dominant-baseline="central" font-size="44" font-family="Montserrat" font-weight="900" fill="#ffffff">ENTRY</text></g>
<g transform="translate(820 780) rotate(6)"><rect x="-180" y="-60" width="360" height="120" fill="#0a0a0a"/><text x="0" y="-18" text-anchor="middle" dominant-baseline="central" font-size="30" font-family="Montserrat" font-weight="900" fill="#ff01aa">BRING</text><text x="0" y="22" text-anchor="middle" dominant-baseline="central" font-size="40" font-family="Montserrat" font-weight="900" fill="#ffffff">SWIMMERS</text></g>
<rect x="120" y="1080" width="840" height="90" fill="#ffffff"/>
<text x="540" y="1125" text-anchor="middle" dominant-baseline="central" font-size="34" font-family="Montserrat" font-weight="900" fill="#0a0a0a" letter-spacing="4">YOUR CLOTHES WON'T THANK YOU</text>
<rect width="1080" height="1350" filter="url(#grain)" opacity="0.18"/>
<image href="/mm-logo-white.png" x="900" y="1270" width="130" height="40"/>
</svg>`;

export const insertTestGeneration = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase()))
      .first();
    if (!user) throw new Error(`No user ${email} — sign up first.`);
    if (!user.brandId) throw new Error("User has no brandId.");

    const now = Date.now();
    const threadId = await ctx.db.insert("threads", {
      userId: user._id,
      brandId: user.brandId,
      title: "Foam Party test poster",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const generationId = await ctx.db.insert("generations", {
      threadId,
      userId: user._id,
      brandId: user.brandId,
      brandConfigVersion: 1,
      prompt: "Foam Party test poster",
      outputCode: injectBrandKit(SAMPLE_SVG),
      renderType: "png",
      format: "4:5",
      designSystem: "social",
      status: "complete",
      retryCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      createdAt: now,
    });
    await ctx.db.insert("messages", {
      threadId, userId: user._id, role: "user",
      content: "Foam Party test poster", createdAt: now,
    });
    await ctx.db.insert("messages", {
      threadId, userId: user._id, role: "assistant",
      content: SAMPLE_SVG, generationId, createdAt: now + 1,
    });
    return { threadId, generationId };
  },
});
