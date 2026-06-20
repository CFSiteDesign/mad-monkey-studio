"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import Anthropic from "@anthropic-ai/sdk";
import { FORMAT_DIMENSIONS } from "../lib/prompt";

// Haiku turns four event answers into a brand-voiced generation brief.
// Cheap (~$0.001/call): claude-haiku-4-5 at $0.80/$4 per 1M tokens.
const MODEL = "claude-haiku-4-5-20251001";

export const composeBrief = action({
  args: {
    title:        v.string(),
    date:         v.string(),
    cost:         v.optional(v.string()),
    location:     v.string(),
    format:       v.string(),
    designSystem: v.string(),
    // Optional smart-follow-up answers (Haiku-generated questions) + free text,
    // woven in to sharpen the hook and copy.
    followUps:    v.optional(v.array(v.object({ q: v.string(), a: v.string() }))),
    extraDetails: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ brief: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.runQuery(api.users.getCurrentUser);
    if (!user?.brandId) throw new Error("No brand assigned.");

    const ds = await ctx.runQuery(internal.generationsInternal.getDesignSystem, {
      brandId: user.brandId,
      name: args.designSystem,
    });
    const dim = FORMAT_DIMENSIONS[args.format];

    const system = `You write generation briefs for the Mad Monkey Hostels design engine (a Gen Z party-hostel brand across Southeast Asia & Australia; slogan ALL IN; voice: your most-travelled friend, slightly hungover, telling you to book the flight).

The brief you write instructs an SVG poster engine. From the event details provided, produce ONE brief that includes:
- A suggested hook headline (1–3 punchy UPPERCASE words, ideally a question or challenge) and a cheeky payoff line — the joke lands across the pair.
  THE HOOK MUST BE ABOUT THE ACTUAL EVENT — its setting, drink, or activity. Anchor it to a concrete noun from the event (the beach, the beers, the boat, the pool), not just the day of the week. A "Beers on the Beach" night should feel beachy/beery (e.g. SANDY & SMASHED, BEACH BEERS O'CLOCK) — do NOT drift to an unrelated pun like "WEDNESDAY JUST GOT WETTER" that ignores the beach and the beer. If you can't tie the pun to the event's real subject, choose a plainer on-theme hook.
- The event details to display, kept VERBATIM as given: title, date, cost (if any), location(s).
- A mood: "pop collage" (loud, sticker-bombed) or "retro print" (bone background, near-monochrome, deadpan) — pick whichever suits the event's energy.
- 1–2 short sticker/badge copy suggestions (≤3 words each, e.g. "FREE SHOTS", "$9 BEDS").

Target asset: ${args.designSystem} design system — ${ds?.description ?? ""}. Format: ${dim?.label ?? args.format} (${dim?.useCase ?? ""}).

Rules: 60–110 words. Plain text only — no markdown, no headings, no preamble, no quotes around the whole thing.
NEVER invent or imply any fact that wasn't provided. This includes prices, times, dates and perks, AND any place-specific claim — scenery or geography ("limestone cliffs", "white-sand beach", "jungle", "waterfalls"), landmarks, distances ("5 min from the beach"), "famous for…", "home to…", named nearby attractions, history, weather, or statistics. You may sell brand energy, vibe and the event details given — but if a concrete detail about the place or event wasn't supplied, do NOT state it as fact. When in doubt, keep it about the party and the people, not invented specifics of the location.`;

    const followUpLines = (args.followUps ?? [])
      .filter((f) => f.a.trim())
      .map((f) => `- ${f.q.trim()} → ${f.a.trim()}`);
    const userMsg = [
      `Event title: ${args.title}`,
      `Date: ${args.date}`,
      args.cost?.trim() ? `Cost: ${args.cost}` : null,
      `Location(s): ${args.location}`,
      followUpLines.length ? `\nExtra context (use it to sharpen the hook & copy):\n${followUpLines.join("\n")}` : null,
      args.extraDetails?.trim() ? `\nAny other details: ${args.extraDetails.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      timeout: 40_000,
      maxRetries: 1,
    });
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system,
      messages: [{ role: "user", content: userMsg }],
    });

    const brief = res.content[0].type === "text" ? res.content[0].text.trim() : "";
    if (!brief) throw new Error("Couldn't compose the brief — try again.");
    return { brief };
  },
});

// Generic fallbacks if Haiku's JSON can't be parsed — still useful, never blocks.
const FALLBACK_QUESTIONS: Record<"event" | "presentation", { q: string; hint: string }[]> = {
  event: [
    { q: "What's the ONE thing people must take away?", hint: "e.g. free entry" },
    { q: "What's the vibe — messy chaos or smooth & classy?", hint: "e.g. messy" },
    { q: "Who's it for, and what should they do?", hint: "e.g. backpackers, book now" },
  ],
  presentation: [
    { q: "Who's the audience and what should they think after?", hint: "e.g. investors, fund us" },
    { q: "What's the single most important takeaway?", hint: "e.g. 40% growth" },
    { q: "Any key numbers, names or facts that MUST appear?", hint: "e.g. 3 new properties" },
  ],
};

// Haiku proposes 3 essential follow-up questions tailored to what's been answered
// so far, so the brief gets the context that most improves the result. Cheap
// (~$0.001/call). Best-effort: on any failure we return sensible defaults.
export const followUpQuestions = action({
  args: {
    kind:         v.union(v.literal("event"), v.literal("presentation")),
    context:      v.string(), // the base answers, assembled by the client
    format:       v.string(),
    designSystem: v.string(),
  },
  handler: async (ctx, args): Promise<{ questions: { q: string; hint: string }[] }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const dim = FORMAT_DIMENSIONS[args.format];
    const subject = args.kind === "presentation" ? "presentation deck" : "poster";

    const system = `You help a marketer brief the Mad Monkey Hostels design engine (Gen Z party-hostel brand, SE Asia & Australia). They've given the basics; your job is to ask the 3 questions whose answers would MOST improve the ${subject}.

Pick questions that change the DESIGN or the MESSAGE — the vibe/energy, the single hero element to feature, a must-include detail, the audience, or the call-to-action. Make them specific to THIS ${subject}, not generic. Never ask something already answered in the context. Each must be answerable in a few words.

Return ONLY a JSON array of EXACTLY 3 objects, nothing else:
[{"q":"<one-line question>","hint":"<a 2-4 word example answer>"}]`;

    const userMsg = `Kind: ${args.kind}\nFormat: ${dim?.label ?? args.format}\nDesign system: ${args.designSystem}\n\nWhat they've told us so far:\n${args.context}`;

    let questions: { q: string; hint: string }[] = [];
    try {
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY!,
        timeout: 30_000,
        maxRetries: 1,
      });
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: userMsg }],
      });
      const text = res.content[0].type === "text" ? res.content[0].text.trim() : "";
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start !== -1 && end > start) {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(parsed)) {
          questions = parsed
            .filter((x) => x && typeof x.q === "string" && x.q.trim())
            .slice(0, 3)
            .map((x) => ({ q: String(x.q).trim(), hint: String(x.hint ?? "").trim() }));
        }
      }
    } catch {
      /* fall through to defaults */
    }

    if (questions.length < 3) questions = FALLBACK_QUESTIONS[args.kind];
    return { questions };
  },
});
