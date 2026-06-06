import { internalMutation } from "./_generated/server";

const MAD_MONKEY_CLAUDE_MD = `You are the Mad Monkey Hostels design engine. Generate render-ready SVG or HTML marketing assets.

BRAND IDENTITY
Mad Monkey is a hostel brand for adventurous travellers. Voice: bold, warm, editorial. Never corporate, never generic.

HARD CONSTRAINTS — violations trigger automatic rejection and regeneration:

COLOURS — only these hex values are permitted, no exceptions:
  Primary:   #CC7A5C (terracotta), #D4956D (sand)
  Secondary: #F2EEE6 (cream), #E8E2D6 (parchment)
  Neutral:   #1C1A18 (charcoal), #242220 (dark surface), #2C2A28 (mid surface), #8C8278 (muted)
  White:     #FFFFFF (use sparingly as contrast only)

FONTS — only these families, no others:
  Display/headings: "Fraunces"  — weights 300, 400, 500 only
  Body/UI text:     "DM Sans"   — weights 300, 400, 500 only

FORMATS — your output must be sized for exactly one of:
  1:1  → 1080 × 1080 px  (Instagram square)
  4:5  → 1080 × 1350 px  (Instagram portrait)
  9:16 → 1080 × 1920 px  (Stories / Reels)
  A4   →  794 × 1123 px  (print at 96 dpi)

DESIGN PRINCIPLES
- Generous whitespace. Let layouts breathe.
- Bold typographic hierarchy. Headline dominates.
- No gradients. No drop shadows. No textures.
- Dark-first: prefer #1C1A18 backgrounds with #F2EEE6 type.
- Terracotta (#CC7A5C) for accents and CTAs only — use sparingly.
- Include the font link tags in any HTML output so fonts load correctly.

OUTPUT FORMAT
Return ONLY the raw SVG or HTML. No markdown fences, no explanation, no preamble.
The output must be valid, self-contained, and render-ready in a browser at the target dimensions.`;

export const seedMadMonkey = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("brands")
      .withIndex("by_slug", (q) => q.eq("slug", "mad-monkey"))
      .unique();

    if (existing) return { status: "already_seeded", brandId: existing._id };

    const brandId = await ctx.db.insert("brands", {
      name: "Mad Monkey Hostels",
      slug: "mad-monkey",
      isActive: true,
      createdAt: Date.now(),
    });

    // ── Design System 1: Social ───────────────────────────────────────────────
    // For Instagram posts, Stories, Reels. Dark-first, high-contrast.
    const socialId = await ctx.db.insert("design_systems", {
      brandId,
      name: "social",
      label: "Social",
      description: "Instagram, Stories, Reels. Dark-first, high-contrast, bold typography.",
      guidelines: "PENDING — Kyle to supply rules and guidelines for the Social design system.",
      baseCssVars: JSON.stringify({
        "--bg": "#1C1A18",
        "--surface": "#242220",
        "--fg": "#F2EEE6",
        "--accent": "#CC7A5C",
        "--muted": "#8C8278",
        "--border": "rgba(242,238,230,0.08)",
      }),
      isActive: true,
      createdAt: Date.now(),
    });

    // ── Design System 2: Brand ────────────────────────────────────────────────
    // For external brand materials, print, campaigns. Light/cream base.
    const brandDsId = await ctx.db.insert("design_systems", {
      brandId,
      name: "brand",
      label: "Brand",
      description: "External brand materials, print, campaigns. Cream base, editorial.",
      guidelines: "PENDING — Kyle to supply rules and guidelines for the Brand design system.",
      baseCssVars: JSON.stringify({
        "--bg": "#F2EEE6",
        "--surface": "#E8E2D6",
        "--fg": "#1C1A18",
        "--accent": "#CC7A5C",
        "--muted": "#8C8278",
        "--border": "rgba(28,26,24,0.08)",
      }),
      isActive: true,
      createdAt: Date.now(),
    });

    // ── Design System 3: Internal ─────────────────────────────────────────────
    // For internal comms, reports, presentations. Clean, legible, functional.
    const internalId = await ctx.db.insert("design_systems", {
      brandId,
      name: "internal",
      label: "Internal",
      description: "Reports, presentations, internal comms. Clean, functional, legible.",
      guidelines: "PENDING — Kyle to supply rules and guidelines for the Internal design system.",
      baseCssVars: JSON.stringify({
        "--bg": "#FFFFFF",
        "--surface": "#F2EEE6",
        "--fg": "#1C1A18",
        "--accent": "#CC7A5C",
        "--muted": "#8C8278",
        "--border": "rgba(28,26,24,0.08)",
      }),
      isActive: true,
      createdAt: Date.now(),
    });

    await ctx.db.insert("brand_config", {
      brandId,
      version: 1,
      palette: {
        primary: ["#CC7A5C", "#D4956D"],
        secondary: ["#F2EEE6", "#E8E2D6"],
        neutral: ["#1C1A18", "#242220", "#2C2A28", "#8C8278", "#FFFFFF"],
      },
      fonts: {
        display: "Fraunces",
        body: "DM Sans",
        allowedWeights: [300, 400, 500],
      },
      formats: ["1:1", "4:5", "9:16", "A4"],
      designSystems: ["social", "brand", "internal"],
      claudeMd: MAD_MONKEY_CLAUDE_MD,
      isActive: true,
      updatedAt: Date.now(),
    });

    return { status: "seeded", brandId, socialId, brandDsId, internalId };
  },
});
