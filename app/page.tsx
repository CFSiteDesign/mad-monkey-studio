"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeSvg } from "@/lib/sanitize-svg";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SignOutButton } from "@/components/sign-out-button";
import { BrandLogo } from "@/components/brand-logo";
import { UploadPhotos, type UploadedImage } from "@/components/upload-photos";
import { GenerationLoader } from "@/components/generation-loader";
import { GenerationCard, type FeedGeneration } from "@/components/generation-card";
import { useGeneration } from "@/components/generation-provider";
import { PoweredBy } from "@/components/powered-by";
import { Walkthrough, type TourStep } from "@/components/walkthrough";
import { FORMAT_DIMENSIONS } from "@/lib/prompt";
import {
  Loader2,
  Sparkles,
  Megaphone,
  ImageOff,
  Check,
  Plus,
  Trash2,
  Wand2,
  ChevronLeft,
  ImagePlus,
  Presentation,
  ArrowRight,
  HelpCircle,
  Home,
  MessageSquare,
} from "lucide-react";

const FORMATS = [
  { id: "1:1", ratio: "aspect-square", name: "a Square" },
  { id: "4:5", ratio: "aspect-[4/5]", name: "Insta Post Size" },
  { id: "9:16", ratio: "aspect-[9/16]", name: "Story, Reel or TikTok shapes" },
  { id: "A4", ratio: "aspect-[794/1123]", name: "Poster" },
] as const;

const DESIGN_SYSTEMS = [
  {
    name: "brand",
    label: "Brand",
    desc: "One universal system — posts, stories, print & decks",
    Icon: Megaphone,
  },
] as const;

// The freshly-returned generation, shown until the thread query catches up.
const ASPECT: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "A4": "aspect-[794/1123]",
};

/** Sanitised SVG thumbnail for a past creation in the gallery. */
function GalleryThumb({ svg, format }: { svg: string; format: string }) {
  const safe = useMemo(() => sanitizeSvg(svg), [svg]);
  return (
    <div
      className={`${ASPECT[format] ?? "aspect-square"} w-full overflow-hidden bg-white [&>svg]:h-full [&>svg]:w-full [&>svg]:object-cover`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

export default function StudioPage() {
  const user = useQuery(api.users.getCurrentUser);
  const followUpQuestions = useAction(api.briefs.followUpQuestions);
  const generateDeck = useAction(api.decks.generateDeck);
  const router = useRouter();

  const [brief, setBrief] = useState("");
  const [deckBrief, setDeckBrief] = useState("");
  const [deckSlides, setDeckSlides] = useState(8);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventCost, setEventCost] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [format, setFormat] = useState<string>("1:1");
  const [designSystem, setDesignSystem] = useState("brand");
  const [includeLogo, setIncludeLogo] = useState(true);
  const [includeAllIn, setIncludeAllIn] = useState(false);
  const [includeAllInMonkey, setIncludeAllInMonkey] = useState(false);
  const [includeStamp, setIncludeStamp] = useState(false);
  // Hover-preview of the brand mark a checkbox will insert, floated by the cursor.
  const [markHover, setMarkHover] = useState<{ src: string; label: string } | null>(null);
  const [markHoverPos, setMarkHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [tourOpen, setTourOpen] = useState(false);
  // Asset generation lives in a provider above the router so it survives
  // navigating to /account or /bank mid-generation. Decks still run locally
  // (they redirect to their own page on completion).
  const {
    generating,
    result,
    error: genError,
    activeThreadId,
    runAsset,
    clearResult,
  } = useGeneration();
  const [deckLoading, setDeckLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const loading = generating || deckLoading;
  const error = genError || localError;

  // ── Smart follow-up questions (Haiku) — a 2-step brief flow for new creations.
  // "base": original questions. "followup": 3 tailored questions + optional details.
  const [briefStep, setBriefStep] = useState<"base" | "followup">("base");
  const [followUps, setFollowUps] = useState<{ q: string; hint: string }[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<string[]>([]);
  const [otherDetails, setOtherDetails] = useState("");
  const [userPhotos, setUserPhotos] = useState<UploadedImage[]>([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);

  function resetBriefFlow() {
    setBriefStep("base");
    setFollowUps([]);
    setFollowUpAnswers([]);
    setOtherDetails("");
    setLoadingFollowUps(false);
  }

  // Switching format or design system invalidates the tailored follow-up
  // questions — drop back to the base step so they're regenerated for the new
  // context rather than showing stale ones. (Suspended while the tour drives
  // the form on purpose.)
  useEffect(() => {
    if (tourOpen) return;
    setBriefStep("base");
    setFollowUps([]);
    setFollowUpAnswers([]);
    setOtherDetails("");
  }, [format, designSystem, tourOpen]);

  // ── Interactive product tour ──────────────────────────────────────────────
  const tourSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // Cancellable typing: each run gets a token; advancing the tour (cancelTyping)
  // bumps the token so any in-flight typing stops instead of fighting the next
  // step's instant values.
  const typeRunRef = useRef(0);
  const cancelTyping = () => {
    typeRunRef.current++;
  };
  async function typeFields(pairs: [(s: string) => void, string][], ms = 26) {
    const run = ++typeRunRef.current;
    for (const [set, text] of pairs) {
      set("");
      for (let k = 1; k <= text.length; k++) {
        if (typeRunRef.current !== run) return; // a newer step took over
        set(text.slice(0, k));
        await tourSleep(ms);
      }
    }
  }
  const DEMO_FOLLOWUPS = [
    { q: "What's the single biggest draw — the foam, the DJ, or the crowd?", hint: "endless foam + DJ" },
    { q: "Who's it for — current guests or travellers still choosing a hostel?", hint: "current guests" },
    { q: "What makes THIS foam party different?", hint: "UV glow, 200 cap" },
  ];
  const DEMO_ANSWERS = ["Endless foam + a DJ", "Current guests", "UV glow + 200-cap"];

  function restoreEventDemo(followup: boolean) {
    cancelTyping();
    setDesignSystem("brand");
    setFormat("4:5");
    setEventTitle("Foam Party");
    setEventDate("Saturday 9pm");
    setEventCost("$8");
    setEventLocation("Mad Monkey Uluwatu, Bali");
    if (followup) {
      setFollowUps(DEMO_FOLLOWUPS);
      setFollowUpAnswers(DEMO_ANSWERS);
      setBriefStep("followup");
    } else {
      setBriefStep("base");
      setFollowUps([]);
    }
  }
  function resetDemo() {
    cancelTyping();
    setDesignSystem("brand");
    setFormat("4:5");
    setBrief("");
    setDeckBrief("");
    setEventTitle("");
    setEventDate("");
    setEventCost("");
    setEventLocation("");
    setIncludeLogo(true);
    setIncludeAllIn(false);
    setIncludeAllInMonkey(false);
    setIncludeStamp(false);
    setOtherDetails("");
    setFollowUps([]);
    setFollowUpAnswers([]);
    setBriefStep("base");
  }
  function closeTour() {
    setTourOpen(false);
    resetDemo();
    if (typeof window !== "undefined") localStorage.setItem("mm-tour-v1", "1");
  }
  // Auto-launch once for first-time users.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem("mm-tour-v1")) {
      const t = setTimeout(() => setTourOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  const TOUR_STEPS: TourStep[] = [
    {
      title: "Welcome to Mad Monkey Studio 🐵",
      body: "A 60-second tour of everything. Take it once and you'll know the whole tool. Use the buttons or your ← → arrow keys.",
      onEnter: () => resetDemo(),
    },
    {
      target: '[data-tour="design-system"]',
      title: "1 · Your design system",
      body: (
        <div className="space-y-1.5">
          <p>
            There's just one — <b className="text-[#F2EEE6]">Brand</b>. A single universal system that does
            everything and stays perfectly on-brand.
          </p>
          <p className="text-[#8C8278]">
            It adapts to whatever format you pick: loud &amp; dark for social posts and stories, editorial for
            print, clean &amp; structured for presentations. Nothing to choose — you're always on-brand.
          </p>
        </div>
      ),
      onEnter: () => setDesignSystem("brand"),
    },
    {
      target: '[data-tour="format"]',
      title: "2 · Choose the format",
      body: "Pick the size and the Brand system tailors the look to it — 1:1, 4:5 or 9:16 for social, A4 for print, or Presentation for a multi-slide deck. The layout locks to this before you write a word.",
      onEnter: () => {
        setDesignSystem("brand");
        setFormat("4:5");
      },
    },
    {
      target: '[data-tour="event-fields"]',
      title: "3 · Answer a few basics",
      body: "Tell us about the event — title, date, location, optional cost. Keep it factual; the AI turns it into a brand-perfect brief, so you never write the brief yourself.",
      onEnter: () => {
        cancelTyping();
        setDesignSystem("brand");
        setFormat("4:5");
        setBriefStep("base");
        setEventTitle(""); setEventDate(""); setEventCost(""); setEventLocation("");
        void typeFields([
          [setEventTitle, "Foam Party"],
          [setEventDate, "Saturday 9pm"],
          [setEventCost, "$8"],
          [setEventLocation, "Mad Monkey Uluwatu, Bali"],
        ]);
      },
    },
    {
      target: '[data-tour="cta"]',
      title: "4 · Hit Continue",
      body: "Instead of generating straight away, the AI reads your answers and asks 3 sharp follow-up questions tailored to THIS event — the details that make the result land.",
      onEnter: () => restoreEventDemo(false),
    },
    {
      target: '[data-tour="followups"]',
      title: "5 · Answer the smart follow-ups",
      body: "These 3 are generated for your exact event. Answer them in a few words for a noticeably better design — or use “skip the extra questions” if you're in a hurry.",
      onEnter: () => restoreEventDemo(true),
    },
    {
      target: '[data-tour="other-details"]',
      title: "6 · Any other details",
      body: "A catch-all for anything else — a must-have detail, a vibe, a call-to-action. Totally optional.",
      onEnter: () => {
        restoreEventDemo(true);
        setOtherDetails("Free shot for the first 50 through the door.");
      },
    },
    {
      target: '[data-tour="brand-marks"]',
      title: "7 · Choose your logo & brand marks",
      body: "This is where you pick which marks go on the asset — tick the Mad Monkey logo, the ALL IN stickers, and/or the Mad Monkey Stamp (any combination). Hover any box to preview exactly which logo/sticker it adds, right by your cursor.",
      onEnter: () => {
        restoreEventDemo(true);
        setIncludeAllIn(true);
      },
    },
    {
      target: '[data-tour="cta"]',
      title: "8 · Generate",
      body: "Hit Generate. ~20s later you've got a validated, on-brand design — no off-palette colours, no clipped text, no overlapping stickers.",
      onEnter: () => restoreEventDemo(true),
    },
    {
      target: '[data-tour="present-fields"]',
      title: "9 · Presentations",
      body: "Pick the Presentation format and you're building a full multi-slide deck — same Brand system, just a different output. Give the topic and a slide count; the AI plans the outline and designs every slide on-brand, then exports straight to PowerPoint.",
      onEnter: () => {
        cancelTyping();
        setDesignSystem("brand");
        setFormat("presentation");
        setDeckSlides(8);
        void (async () => {
          await tourSleep(160);
          await typeFields(
            [[setDeckBrief, "Investor pitch for our Bali expansion — 3 new properties, the team, and the $4M ask."]],
            14,
          );
        })();
      },
    },
    {
      target: '[data-tour="gallery"]',
      title: "10 · Your gallery",
      body: "Everything you create lands here. Click any version to refine it in plain English, hand-edit it with Quick Fix, or export to PNG / JPG / PDF / PowerPoint.",
    },
    {
      target: '[data-tour="account-menu"]',
      title: "11 · The image bank",
      body: (
        <div className="space-y-1.5">
          <p>
            Click your avatar (up here) → <b className="text-[#F2EEE6]">Image bank</b>. It's the shared library of
            real Mad Monkey photos — foam parties, pool days, dorms, beach runs.
          </p>
          <p className="text-[#8C8278]">
            Upload a shot with a short description and the AI automatically drops the best-matching photo into your
            designs. A fresh bank starts empty — load it up, because the more real photos it holds, the better every
            poster and deck looks.
          </p>
        </div>
      ),
    },
    {
      title: "That's everything — you're ALL IN 🐵",
      body: "You now know the whole tool: systems, formats, the smart questions, presentations, the gallery and the image bank. Replay this tour anytime from “How it works” in the top bar.",
    },
  ];

  // ── Gallery (past creations) ──
  const threads = useQuery(api.threads.list);
  const decks = useQuery(api.decksInternal.listDecks);
  // Recent failed runs — so an empty gallery can explain "media created" that
  // didn't pass brand checks rather than looking mysteriously empty.
  const stats = useQuery(api.usage.myStats);
  const failedCount = stats?.month.failed ?? 0;
  const [threadId, setThreadId] = useState<Id<"threads"> | null>(null);
  const activeThread = useQuery(api.threads.get, threadId ? { threadId } : "skip");
  const archiveThread = useMutation(api.threads.archive);
  const deleteDeck = useMutation(api.decksInternal.deleteDeck);
  const [confirmDeleteDeckId, setConfirmDeleteDeckId] = useState<Id<"decks"> | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<Id<"threads"> | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  function createNew() {
    setThreadId(null);
    clearResult();
    setBrief("");
    setLocalError("");
    setUserPhotos([]);
    resetBriefFlow();
  }

  function selectThread(id: Id<"threads">) {
    if (loading) return;
    setThreadId(id);
    clearResult();
    setBrief("");
    setLocalError("");
    setUserPhotos([]);
  }

  async function handleDelete(id: Id<"threads">) {
    setConfirmDeleteId(null);
    try {
      await archiveThread({ threadId: id });
      if (id === threadId) createNew();
    } catch {
      /* reactive list will reflect reality */
    }
  }

  // Selecting a chat syncs the controls to its latest design.
  useEffect(() => {
    if (!threadId || loading) return;
    const gens = activeThread?.generations;
    if (!gens || gens.length === 0) return;
    const last = gens[gens.length - 1];
    setFormat(last.format);
    setDesignSystem(last.designSystem);
  }, [threadId, activeThread, loading]);

  // Re-attach to the thread of an in-flight / just-finished generation whenever
  // the page (re)mounts — e.g. after popping over to /account or /bank while a
  // design was still generating. The work keeps running in the provider; this
  // just reconnects the view to it.
  useEffect(() => {
    if (activeThreadId && activeThreadId !== threadId) setThreadId(activeThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

  // "Presentation" is a format (16:9 multi-slide deck) under the universal Brand
  // system, driven by a single free-text details box instead of the event fields.
  const isPresentation = format === "presentation";

  const eventFieldsReady =
    eventTitle.trim().length > 0 &&
    eventDate.trim().length > 0 &&
    eventLocation.trim().length > 0;
  const presentationReady = deckBrief.trim().length > 0;

  const baseReady = isPresentation ? presentationReady : eventFieldsReady;

  // Step 1 (new creations): ask Haiku for 3 tailored follow-up questions.
  async function loadFollowUps() {
    if (loadingFollowUps || !baseReady) return;
    setLoadingFollowUps(true);
    setLocalError("");
    try {
      const context = isPresentation
        ? `Topic: ${deckBrief.trim()}\nSlides: ${deckSlides}`
        : [
            `Event: ${eventTitle.trim()}`,
            `Date: ${eventDate.trim()}`,
            eventCost.trim() ? `Cost: ${eventCost.trim()}` : null,
            `Location: ${eventLocation.trim()}`,
          ]
            .filter(Boolean)
            .join("\n");
      const { questions } = await followUpQuestions({
        kind: isPresentation ? "presentation" : "event",
        context,
        format,
        designSystem,
      });
      // Events always lead with "What's included?" — the detail that most often
      // makes or breaks a promo (free entry, a drink, a t-shirt…).
      const whatsIncluded = { q: "What's included?", hint: "e.g. free entry, drink, t-shirt" };
      const withIncluded = isPresentation ? questions : [whatsIncluded, ...questions];
      setFollowUps(withIncluded);
      setFollowUpAnswers(withIncluded.map(() => ""));
    } catch {
      // best-effort — still ask "What's included?" for events, plus the details box
      setFollowUps(isPresentation ? [] : [{ q: "What's included?", hint: "e.g. free entry, drink, t-shirt" }]);
    } finally {
      setBriefStep("followup");
      setLoadingFollowUps(false);
    }
  }

  async function handleGenerate(e?: React.FormEvent, opts?: { skip?: boolean }) {
    e?.preventDefault();
    if (loading || loadingFollowUps) return;

    const newCreation = !threadId;
    // New creations route through the follow-up step first (unless skipping).
    if (newCreation && briefStep === "base" && !opts?.skip) {
      if (!baseReady) return;
      await loadFollowUps();
      return;
    }

    const answeredFollowUps = followUps
      .map((f, i) => ({ q: f.q, a: (followUpAnswers[i] ?? "").trim() }))
      .filter((p) => p.a);

    // The user's own uploaded photos are already in the bank; tell the engine to
    // feature them (it matches the bank image by this description).
    const readyPhotos = userPhotos.filter((p) => p.status === "ready" && p.description);
    const photoInstruction = readyPhotos.length
      ? `Feature the user's own uploaded photo${readyPhotos.length > 1 ? "s" : ""} as the main/hero image — use the bank image${readyPhotos.length > 1 ? "s" : ""} described as: ${readyPhotos.map((p) => `"${p.description}"`).join("; ")}.`
      : "";

    // Presentation = a multi-slide deck. Generate, then jump to its view.
    if (isPresentation && newCreation) {
      if (!presentationReady) return;
      setDeckLoading(true);
      setLocalError("");
      try {
        const extra = [
          ...answeredFollowUps.map((p) => `- ${p.q} ${p.a}`),
          otherDetails.trim() ? `Other details: ${otherDetails.trim()}` : "",
          photoInstruction,
        ].filter(Boolean);
        const enrichedBrief = extra.length
          ? `${deckBrief.trim()}\n\nAdditional context:\n${extra.join("\n")}`
          : deckBrief.trim();
        const { deckId } = await generateDeck({
          brief: enrichedBrief,
          designSystem: "brand",
          slideCount: deckSlides,
        });
        setDeckBrief("");
        setUserPhotos([]);
        resetBriefFlow();
        router.push(`/presentation/${deckId}`);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : "Presentation failed.");
        setDeckLoading(false);
      }
      return;
    }

    if (threadId ? !brief.trim() : !eventFieldsReady) return;
    // Hand the whole compose+generate sequence to the provider (above the
    // router) so it keeps running even if the user pops over to /account or
    // /bank mid-generation. New creations: Haiku expands the event answers into
    // a brand-voiced brief first. Refinements send the refine text directly.
    const res = await runAsset({
      briefText: threadId ? brief : undefined,
      compose: threadId
        ? undefined
        : {
            title: eventTitle.trim(),
            date: eventDate.trim(),
            cost: eventCost.trim() || undefined,
            location: eventLocation.trim(),
            format,
            designSystem,
            followUps: answeredFollowUps.length ? answeredFollowUps : undefined,
            extraDetails: [otherDetails.trim(), photoInstruction].filter(Boolean).join(" ") || undefined,
          },
      format,
      designSystem,
      threadId: threadId ?? undefined,
      includeLogo,
      includeAllIn,
      includeAllInMonkey,
      includeStamp,
    });
    // Runs only if the page is still mounted — the provider holds the result +
    // thread regardless. Clears the brief form for the next creation.
    if (res) {
      setThreadId(res.threadId);
      setBrief("");
      setEventTitle("");
      setEventDate("");
      setEventCost("");
      setEventLocation("");
      setUserPhotos([]);
      resetBriefFlow();
    }
  }

  // ── Chat feed: every on-brand generation in this thread, oldest first ──
  const localFeed: FeedGeneration[] = result
    ? [{
        id: result.generationId,
        outputCode: result.outputCode,
        format: result.format,
        designSystem: result.designSystem,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
        retryCount: result.retryCount,
        notes: result.notes,
      }]
    : [];
  const feed: FeedGeneration[] = threadId
    ? (activeThread?.generations ?? localFeed)
    : localFeed;
  const threadLoading = Boolean(threadId) && activeThread === undefined;

  // Keep the newest version (or the loader) in view as the feed grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [feed.length, loading]);

  const charCount = brief.length;

  return (
    <div className="mm-ambient relative flex h-screen flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="z-20 flex shrink-0 items-center justify-between border-b border-[rgba(242,238,230,0.08)] bg-[#1C1A18]/70 px-6 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-8 w-auto" />
          <span className="h-6 w-px bg-[rgba(242,238,230,0.12)]" />
          <p
            className="text-lg font-light leading-none text-[#F2EEE6]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Studio
          </p>
          {user?.role && (
            <span className="ml-1 rounded-full border border-[rgba(242,238,230,0.1)] px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-[#8C8278]">
              {user.role}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={createNew}
            className="flex items-center gap-1.5 rounded-full border border-[rgba(242,238,230,0.12)] px-3 py-1.5 text-[11px] text-[#CFC8BD] transition-colors hover:border-[#CC7A5C]/60 hover:text-[#F2EEE6]"
            title="Start fresh — back to a new creation"
          >
            <Home className="h-3.5 w-3.5" /> Home
          </button>
          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLSdCGDQJTQHuj1OY3I8mAtQL7vyTAfK3Ym-gEmfQHjursAm1Vw/viewform"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-[rgba(242,238,230,0.12)] px-3 py-1.5 text-[11px] text-[#CFC8BD] transition-colors hover:border-[#CC7A5C]/60 hover:text-[#F2EEE6]"
            title="Share feedback (opens a form in a new tab)"
          >
            <MessageSquare className="h-3.5 w-3.5" /> Feedback
          </a>
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-[rgba(242,238,230,0.12)] px-3 py-1.5 text-[11px] text-[#CFC8BD] transition-colors hover:border-[#CC7A5C]/60 hover:text-[#F2EEE6]"
            title="Take the tour"
          >
            <HelpCircle className="h-3.5 w-3.5" /> How it works
          </button>
          <SignOutButton initials={initials} email={user?.email} />
        </div>
      </header>

      <Walkthrough steps={TOUR_STEPS} open={tourOpen} onClose={closeTour} />

      {/* ── Body ── */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* ── Gallery sidebar (collapsible) ── */}
        <aside
          data-tour="gallery"
          className={`relative flex shrink-0 flex-col overflow-hidden border-r border-[rgba(242,238,230,0.08)] bg-[#1C1A18]/60 transition-[width] duration-300 ease-in-out ${
            galleryOpen ? "w-64" : "w-12"
          }`}
        >
          {/* Persistent header — toggle always reachable */}
          <div className="flex shrink-0 items-center justify-between px-2.5 pb-1 pt-3.5">
            {/* Width collapses with the rail — opacity alone would leave the
                label's footprint pushing the chevron out of the 48px rail */}
            <p
              className={`mm-eyebrow overflow-hidden whitespace-nowrap transition-all duration-200 ${
                galleryOpen ? "max-w-[6rem] pl-1.5 opacity-100" : "max-w-0 pl-0 opacity-0"
              }`}
            >
              Gallery
            </p>
            <button
              onClick={() => setGalleryOpen((o) => !o)}
              aria-label={galleryOpen ? "Collapse gallery" : "Expand gallery"}
              className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md text-[#8C8278] transition-colors hover:bg-[rgba(242,238,230,0.06)] hover:text-[#F2EEE6]"
            >
              <ChevronLeft
                className={`h-4 w-4 transition-transform duration-300 ${
                  galleryOpen ? "" : "rotate-180"
                }`}
              />
            </button>
          </div>

          {/* Collapsed quick-create — crossfades in when the rail is closed.
              Only disable it while collapsed: when the gallery is open it's
              hidden (opacity-0), and disabled:opacity-40 would otherwise win on
              specificity and ghost the icon through the real button mid-generation. */}
          <button
            onClick={createNew}
            disabled={loading && !galleryOpen}
            aria-label="Create something new"
            title="Create something new"
            className={`mm-cta absolute left-1/2 top-[3.25rem] grid h-8 w-8 -translate-x-1/2 cursor-pointer place-items-center rounded-md text-[#F7F3EC] transition-opacity duration-200 disabled:opacity-40 ${
              galleryOpen ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            <ImagePlus className="h-4 w-4" />
          </button>

          {/* Body — fixed width so it clips cleanly instead of reflowing as the rail shrinks */}
          <div
            className={`flex w-64 min-h-0 flex-1 flex-col transition-opacity duration-200 ${
              galleryOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {/* Create something new */}
            <div className="px-3 pb-3 pt-1">
              <button
                onClick={createNew}
                disabled={loading}
                className="mm-cta flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[#F7F3EC] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                Create something new
              </button>
            </div>

            {/* Gallery grid */}
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {threads === undefined ? (
                <div className="flex items-center gap-2 px-1 py-2 text-xs text-[#8C8278]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#CC7A5C]" />
                  Loading…
                </div>
              ) : threads.length === 0 ? (
                <p className="px-1 py-2 text-xs leading-relaxed text-[#8C8278]/70">
                  {failedCount > 0
                    ? `${failedCount} recent ${failedCount === 1 ? "run" : "runs"} didn't pass brand checks, so nothing's landed here yet. Only on-brand designs appear — tweak the brief and try again.`
                    : "Nothing here yet — hit Create something new and your first asset lands in this gallery."}
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-2.5">
                  {threads.map((t) => {
                    const active = t.id === threadId;
                    const confirming = confirmDeleteId === t.id;
                    return (
                      <li key={t.id} className="group relative">
                        <button
                          onClick={() => selectThread(t.id)}
                          disabled={loading}
                          className={`block w-full overflow-hidden rounded-lg border text-left transition-all duration-200 disabled:cursor-not-allowed ${
                            active
                              ? "border-[#CC7A5C]/70 ring-1 ring-[#CC7A5C]/40"
                              : "border-[rgba(242,238,230,0.08)] hover:border-[rgba(242,238,230,0.25)]"
                          } ${loading ? "" : "cursor-pointer"}`}
                        >
                          {t.thumbnail ? (
                            <GalleryThumb svg={t.thumbnail} format={t.format} />
                          ) : (
                            <div className="grid aspect-square w-full place-items-center bg-[rgba(242,238,230,0.03)]">
                              <ImageOff className="h-5 w-5 text-[#8C8278]/50" />
                            </div>
                          )}
                          <p className="line-clamp-2 px-2 py-1.5 text-[11px] leading-snug text-[#CFC8BD]">
                            {t.caption || "Untitled"}
                          </p>
                        </button>

                        {/* Delete trigger */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(t.id);
                          }}
                          disabled={loading}
                          aria-label="Delete creation"
                          className="absolute right-1.5 top-1.5 grid h-6 w-6 cursor-pointer place-items-center rounded-md bg-[#1C1A18]/80 text-[#8C8278] opacity-0 backdrop-blur transition-opacity hover:text-red-300 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>

                        {/* Are-you-sure overlay */}
                        {confirming && (
                          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-[#1C1A18]/95 p-2 text-center backdrop-blur-sm">
                            <p className="text-[11px] font-medium leading-snug text-[#F2EEE6]">
                              Delete this creation?
                            </p>
                            <div className="flex gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(t.id);
                                }}
                                className="cursor-pointer rounded-md bg-red-500/80 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-red-500"
                              >
                                Delete
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(null);
                                }}
                                className="cursor-pointer rounded-md bg-[rgba(242,238,230,0.1)] px-2.5 py-1 text-[11px] font-medium text-[#F2EEE6] transition-colors hover:bg-[rgba(242,238,230,0.18)]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Presentations */}
              {decks && decks.length > 0 && (
                <div className="mt-5 space-y-2">
                  <p className="mm-eyebrow flex items-center gap-1.5">
                    <Presentation className="h-3 w-3" /> Presentations
                  </p>
                  <ul className="space-y-1.5">
                    {decks.map((d) => (
                      <li key={d._id} className="group relative">
                        <button
                          onClick={() => router.push(`/presentation/${d._id}`)}
                          className="flex w-full items-center gap-2 rounded-lg border border-[rgba(242,238,230,0.08)] px-2.5 py-2 pr-8 text-left transition-colors hover:border-[rgba(242,238,230,0.25)] hover:bg-[rgba(242,238,230,0.02)]"
                        >
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#CC7A5C]/15 text-[#CC7A5C]">
                            {d.status === "generating" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Presentation className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-medium text-[#CFC8BD]">
                              {d.title || "Untitled deck"}
                            </span>
                            <span className="block text-[10px] text-[#8C8278]">
                              {d.status === "generating"
                                ? `${d.slidesDone}/${d.slideCount} slides…`
                                : `${d.slidesDone} slides`}
                            </span>
                          </span>
                        </button>

                        {/* Delete trigger */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteDeckId(d._id);
                          }}
                          aria-label="Delete presentation"
                          className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-md bg-[#1C1A18]/80 text-[#8C8278] opacity-0 backdrop-blur transition-opacity hover:text-red-300 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>

                        {/* Are-you-sure overlay */}
                        {confirmDeleteDeckId === d._id && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center gap-1.5 rounded-lg bg-[#1C1A18]/95 px-2 backdrop-blur-sm">
                            <span className="text-[11px] font-medium text-[#F2EEE6]">Delete?</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteDeck({ deckId: d._id });
                                setConfirmDeleteDeckId(null);
                              }}
                              className="cursor-pointer rounded-md bg-red-500/80 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-red-500"
                            >
                              Delete
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteDeckId(null);
                              }}
                              className="cursor-pointer rounded-md bg-[rgba(242,238,230,0.1)] px-2 py-1 text-[11px] font-medium text-[#F2EEE6] transition-colors hover:bg-[rgba(242,238,230,0.18)]"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ── Left control panel ── */}
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-[rgba(242,238,230,0.08)] bg-[#1C1A18]/40">
          <form onSubmit={handleGenerate} className="flex flex-1 flex-col">
            {/* Locked while a generation is in flight — nothing about the
                in-progress design can change mid-run. */}
            <fieldset
              disabled={loading}
              className={`m-0 flex flex-1 flex-col gap-7 border-0 p-6 transition-opacity [min-inline-size:0] ${
                loading ? "pointer-events-none opacity-50" : ""
              }`}
            >
            {/* Event details / Refine */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor={threadId ? "brief" : isPresentation ? "deck-brief" : "event-title"} className="mm-eyebrow">
                  {threadId ? "Refine" : isPresentation ? "Presentation details" : "Event details"}
                </label>
                {threadId && (
                  <span className="text-[10px] tabular-nums text-[#8C8278]/60">
                    {charCount}
                  </span>
                )}
              </div>

              {/* Conversation so far — briefs sent in this chat */}
              {threadId && activeThread && activeThread.briefs.length > 0 && (
                <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-lg border border-[rgba(242,238,230,0.08)] bg-[rgba(242,238,230,0.02)] p-2.5">
                  {activeThread.briefs.map((b) => (
                    <p
                      key={b.id}
                      className="border-l-2 border-[#CC7A5C]/40 pl-2 text-[11px] leading-relaxed text-[#8C8278]"
                    >
                      {b.content}
                    </p>
                  ))}
                </div>
              )}

              {threadId ? (
                <textarea
                  id="brief"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  rows={4}
                  spellCheck
                  placeholder="What should change? “Make the headline bigger”, “swap to the lime colourway”, “use the pool party photo”…"
                  className="mm-field w-full resize-none rounded-lg px-3.5 py-3 text-sm leading-relaxed text-[#F2EEE6] placeholder:text-[#8C8278]/55"
                />
              ) : isPresentation ? (
                <div className="space-y-3" data-tour="present-fields">
                  <div className="space-y-1.5">
                    <label htmlFor="deck-brief" className="block text-[11px] font-medium text-[#CFC8BD]">
                      What is the presentation about?
                    </label>
                    <textarea
                      id="deck-brief"
                      value={deckBrief}
                      onChange={(e) => setDeckBrief(e.target.value)}
                      rows={5}
                      spellCheck
                      placeholder={`Topic, audience, and the key points / numbers to cover. e.g. Investor pitch for Mad Monkey Bali expansion — 3 new properties, 2027 target, occupancy and revenue highlights, the team, and the ask of $2M.`}
                      className="mm-field w-full resize-none rounded-lg px-3.5 py-3 text-sm leading-relaxed text-[#F2EEE6] placeholder:text-[#8C8278]/55"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="deck-slides" className="block text-[11px] font-medium text-[#CFC8BD]">
                      How many slides?
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="deck-slides"
                        type="number"
                        min={3}
                        max={14}
                        value={deckSlides}
                        onChange={(e) =>
                          setDeckSlides(Math.max(3, Math.min(14, Number(e.target.value) || 8)))
                        }
                        className="mm-field w-20 rounded-lg px-3.5 py-2.5 text-sm text-[#F2EEE6]"
                      />
                      <span className="text-[11px] text-[#8C8278]">slides (3–14) · Claude plans the rest</span>
                    </div>
                  </div>
                  <UploadPhotos images={userPhotos} onChange={setUserPhotos} />
                </div>
              ) : (
                <div className="space-y-2" data-tour="event-fields">
                  <input
                    id="event-title"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    spellCheck
                    placeholder="Event title — “Foam Party”, “Bar Olympics”…"
                    className="mm-field w-full rounded-lg px-3.5 py-2.5 text-sm text-[#F2EEE6] placeholder:text-[#8C8278]/55"
                  />
                  <input
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    placeholder="Date — “Friday 4th July, 10pm”"
                    className="mm-field w-full rounded-lg px-3.5 py-2.5 text-sm text-[#F2EEE6] placeholder:text-[#8C8278]/55"
                  />
                  <input
                    value={eventCost}
                    onChange={(e) => setEventCost(e.target.value)}
                    placeholder="Cost (optional) — “$9”, “free entry”"
                    className="mm-field w-full rounded-lg px-3.5 py-2.5 text-sm text-[#F2EEE6] placeholder:text-[#8C8278]/55"
                  />
                  <input
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    spellCheck
                    placeholder="Location(s) — “Mad Monkey Uluwatu, Bali”"
                    className="mm-field w-full rounded-lg px-3.5 py-2.5 text-sm text-[#F2EEE6] placeholder:text-[#8C8278]/55"
                  />
                  <UploadPhotos images={userPhotos} onChange={setUserPhotos} />
                </div>
              )}

              {/* Smart follow-up questions (Haiku) — new creations only */}
              {!threadId && briefStep === "followup" && (
                <div data-tour="followups" className="space-y-3 rounded-lg border border-[rgba(242,238,230,0.1)] bg-[#242220]/50 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium text-[#CFC8BD]">
                      A few more questions for a sharper result{" "}
                      <span className="text-[#8C8278]">· optional</span>
                    </p>
                    <button
                      type="button"
                      onClick={resetBriefFlow}
                      className="text-[10px] text-[#8C8278] transition-colors hover:text-[#CFC8BD]"
                    >
                      ← edit basics
                    </button>
                  </div>
                  {followUps.length === 0 ? (
                    <p className="text-[11px] leading-relaxed text-[#8C8278]">
                      Couldn’t fetch extra questions — add any details below, or just generate.
                    </p>
                  ) : (
                    followUps.map((f, i) => (
                      <div key={i} className="space-y-1">
                        <label className="block text-[11px] leading-snug text-[#CFC8BD]">{f.q}</label>
                        <input
                          value={followUpAnswers[i] ?? ""}
                          onChange={(e) =>
                            setFollowUpAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))
                          }
                          placeholder={f.hint ? `e.g. ${f.hint}` : "Your answer…"}
                          className="mm-field w-full rounded-lg px-3 py-2 text-sm text-[#F2EEE6] placeholder:text-[#8C8278]/55"
                        />
                      </div>
                    ))
                  )}
                  <div className="space-y-1" data-tour="other-details">
                    <label className="block text-[11px] text-[#CFC8BD]">
                      Any other details? <span className="text-[#8C8278]">· optional</span>
                    </label>
                    <textarea
                      value={otherDetails}
                      onChange={(e) => setOtherDetails(e.target.value)}
                      rows={2}
                      spellCheck
                      placeholder="Anything else that should shape the design…"
                      className="mm-field w-full resize-none rounded-lg px-3 py-2 text-sm leading-relaxed text-[#F2EEE6] placeholder:text-[#8C8278]/55"
                    />
                  </div>
                </div>
              )}

              {/* Brand marks — new creations only (a refinement keeps the marks
                  already on the design). Hover a checkbox to preview the mark. */}
              {!isPresentation && !threadId && (
              <div data-tour="brand-marks" className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-0.5">
                {(
                  [
                    { label: "Mad Monkey logo", src: "/mm-logo-white.png", checked: includeLogo, set: setIncludeLogo },
                    { label: "ALL IN sticker", src: "/mm-allin.png", checked: includeAllIn, set: setIncludeAllIn },
                    { label: "ALL IN Mad Monkey Hostels sticker", src: "/mm-allin-monkey.png", checked: includeAllInMonkey, set: setIncludeAllInMonkey },
                    { label: "Mad Monkey Stamp", src: "/mm-stamp.png", checked: includeStamp, set: setIncludeStamp },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.label}
                    className="flex cursor-pointer items-center gap-2 text-xs text-[#CFC8BD]"
                    onMouseEnter={(e) => {
                      setMarkHover({ src: opt.src, label: opt.label });
                      setMarkHoverPos({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseMove={(e) => setMarkHoverPos({ x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setMarkHover(null)}
                  >
                    <input
                      type="checkbox"
                      checked={opt.checked}
                      onChange={(e) => opt.set(e.target.checked)}
                      className="h-3.5 w-3.5 cursor-pointer accent-[#CC7A5C]"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              )}

              {/* Floating brand-mark preview — follows the cursor on checkbox hover */}
              {markHover && (
                <div
                  className="pointer-events-none fixed z-50 flex flex-col items-center rounded-lg border border-[rgba(242,238,230,0.15)] bg-[#2b2926] p-2 shadow-2xl"
                  style={{ left: markHoverPos.x + 18, top: markHoverPos.y + 18 }}
                >
                  <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-md bg-[#8c8c8c]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={markHover.src}
                      alt={markHover.label}
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <p className="mt-1.5 w-28 text-center text-[10px] leading-tight text-[#CFC8BD]">
                    {markHover.label}
                  </p>
                </div>
              )}

              <p className="text-[11px] italic text-[#8C8278]/60">
                {threadId
                  ? "Refinements keep the current design and change what you ask for."
                  : isPresentation
                  ? "Claude outlines the deck and designs every slide on-brand — then you can export to PowerPoint."
                  : "We turn your answers into a brand-perfect brief automatically."}
              </p>
            </div>

            {/* Design system — hidden while refining (a refinement keeps it) */}
            {!threadId && (
            <div className="space-y-2.5" data-tour="design-system">
              <label className="mm-eyebrow">Design system</label>
              <div className="space-y-2">
                {DESIGN_SYSTEMS.map(({ name, label, desc, Icon }) => {
                  const active = designSystem === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setDesignSystem(name)}
                      aria-pressed={active}
                      className={`group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-200 cursor-pointer ${
                        active
                          ? "border-[#CC7A5C]/70 bg-[#CC7A5C]/10"
                          : "border-[rgba(242,238,230,0.08)] hover:border-[rgba(242,238,230,0.2)] hover:bg-[rgba(242,238,230,0.02)]"
                      }`}
                    >
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors ${
                          active
                            ? "bg-[#CC7A5C] text-[#F7F3EC]"
                            : "bg-[rgba(242,238,230,0.05)] text-[#8C8278] group-hover:text-[#F2EEE6]"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-sm font-medium ${
                            active ? "text-[#F2EEE6]" : "text-[#CFC8BD]"
                          }`}
                        >
                          {label}
                        </span>
                        <span className="block text-[11px] text-[#8C8278]">{desc}</span>
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0 text-[#CC7A5C]" />}
                    </button>
                  );
                })}
              </div>
            </div>
            )}

            {/* Format — hidden while refining (a refinement keeps it) */}
            {!threadId && (
            <div className="space-y-2.5" data-tour="format">
              <label className="mm-eyebrow">Format</label>
              <div className="grid grid-cols-2 gap-2">
                {FORMATS.map(({ id, ratio, name }) => {
                  const active = format === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFormat(id)}
                      aria-pressed={active}
                      title={FORMAT_DIMENSIONS[id]?.label ?? id}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all duration-200 ${
                        active
                          ? "border-[#CC7A5C]/70 bg-[#CC7A5C]/10"
                          : "border-[rgba(242,238,230,0.08)] hover:border-[rgba(242,238,230,0.2)]"
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                        <span
                          className={`${ratio} w-auto rounded-[3px] border ${
                            active
                              ? "border-[#CC7A5C] bg-[#CC7A5C]/25"
                              : "border-[#8C8278]/50 bg-[rgba(242,238,230,0.04)]"
                          }`}
                          style={{ height: "1.6rem" }}
                        />
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`block text-[12px] font-semibold leading-tight ${
                            active ? "text-[#F2EEE6]" : "text-[#CFC8BD]"
                          }`}
                        >
                          {id}
                        </span>
                        <span className="block text-[10px] leading-tight text-[#8C8278]">
                          {name}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Presentation — a multi-slide deck format (universal Brand system) */}
              {(
                <button
                  type="button"
                  onClick={() => setFormat("presentation")}
                  aria-pressed={isPresentation}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-200 ${
                    isPresentation
                      ? "border-[#CC7A5C]/70 bg-[#CC7A5C]/10"
                      : "border-[rgba(242,238,230,0.08)] hover:border-[rgba(242,238,230,0.2)]"
                  }`}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${
                      isPresentation ? "bg-[#CC7A5C] text-[#F7F3EC]" : "bg-[rgba(242,238,230,0.05)] text-[#8C8278]"
                    }`}
                  >
                    <Presentation className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium ${isPresentation ? "text-[#F2EEE6]" : "text-[#CFC8BD]"}`}>
                      Presentation
                    </span>
                    <span className="block text-[11px] text-[#8C8278]">Multi-slide deck · 16:9 · exports to PowerPoint</span>
                  </span>
                  {isPresentation && <Check className="h-4 w-4 shrink-0 text-[#CC7A5C]" />}
                </button>
              )}

              {/* Selected-format intent — what Claude will design for */}
              {isPresentation ? (
                <div className="rounded-lg border border-[rgba(242,238,230,0.08)] bg-[rgba(242,238,230,0.02)] px-3 py-2.5">
                  <p className="text-[11px] font-medium text-[#CFC8BD]">On-brand slide deck (PowerPoint export)</p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#8C8278]">1920 × 1080 px · landscape · {deckSlides} slides</p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#8C8278]">
                    Claude outlines the deck from your answers, then designs every slide on-brand.
                  </p>
                </div>
              ) : FORMAT_DIMENSIONS[format] && (
                <div className="rounded-lg border border-[rgba(242,238,230,0.08)] bg-[rgba(242,238,230,0.02)] px-3 py-2.5">
                  <p className="text-[11px] font-medium text-[#CFC8BD]">
                    {FORMAT_DIMENSIONS[format].useCase}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#8C8278]">
                    {FORMAT_DIMENSIONS[format].w} × {FORMAT_DIMENSIONS[format].h} px ·{" "}
                    {FORMAT_DIMENSIONS[format].orientation}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#8C8278]">
                    Layout locked to this format before your brief drops in.
                  </p>
                </div>
              )}
            </div>
            )}

            <div className="flex-1" />

            {/* Generate */}
            <div className="space-y-3">
              <button
                type="submit"
                data-tour="cta"
                disabled={
                  loading ||
                  loadingFollowUps ||
                  (threadId
                    ? !brief.trim()
                    : !baseReady)
                }
                className="mm-cta flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-[#F7F3EC] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />{" "}
                    {isPresentation ? "Building your deck…" : "Going all in…"}
                  </>
                ) : loadingFollowUps ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Thinking of questions…
                  </>
                ) : threadId ? (
                  <>
                    <Wand2 className="h-4 w-4" /> Refine design
                  </>
                ) : briefStep === "base" ? (
                  <>
                    Continue <ArrowRight className="h-4 w-4" />
                  </>
                ) : isPresentation ? (
                  <>
                    <Presentation className="h-4 w-4" /> Build presentation
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate
                  </>
                )}
              </button>

              {/* Skip the extra questions straight to generate (base step only). */}
              {!threadId && briefStep === "base" && baseReady && !loading && !loadingFollowUps && (
                <button
                  type="button"
                  onClick={() => handleGenerate(undefined, { skip: true })}
                  className="w-full text-center text-[11px] text-[#8C8278] transition-colors hover:text-[#CFC8BD]"
                >
                  skip the extra questions →
                </button>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-300"
                >
                  {error}
                </p>
              )}
            </div>
            </fieldset>
          </form>
        </aside>

        {/* ── Canvas: scrollable chat feed of every version ── */}
        <main
          className="relative flex flex-1 flex-col overflow-y-auto bg-[#18160F] p-8"
          style={{
            backgroundImage:
              "linear-gradient(rgba(242,238,230,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(242,238,230,0.04) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        >
          {threadLoading && feed.length === 0 && !loading ? (
            <div className="m-auto flex items-center gap-2 text-sm text-[#8C8278]">
              <Loader2 className="h-4 w-4 animate-spin text-[#CC7A5C]" />
              Loading chat…
            </div>
          ) : feed.length === 0 && !loading ? (
            <div className="m-auto flex max-w-xs flex-col items-center gap-4 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-2xl border border-[rgba(242,238,230,0.08)] bg-[rgba(242,238,230,0.02)]">
                <ImageOff className="h-7 w-7 text-[#8C8278]/60" strokeWidth={1.5} />
              </div>
              <div className="space-y-1.5">
                <p
                  className="text-xl font-light text-[#F2EEE6]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Your canvas awaits
                </p>
                <p className="text-sm leading-relaxed text-[#8C8278]">
                  Answer a few questions, pick your format, then hit Generate to see an
                  on-brand asset appear here.
                </p>
              </div>
              <div className="mt-1 flex items-center gap-2 rounded-full border border-[rgba(242,238,230,0.08)] px-3 py-1 text-[11px] text-[#8C8278]">
                <span className="capitalize text-[#CFC8BD]">{designSystem}</span>
                <span className="text-[#8C8278]/40">·</span>
                <span className="text-[#CFC8BD]">{format}</span>
                <span className="text-[#8C8278]/40">·</span>
                <span>{FORMAT_DIMENSIONS[format]?.label?.split("—")[0]?.trim() ?? format}</span>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-14 pb-8">
              {feed.map((g, i) => (
                <GenerationCard key={g.id} gen={g} version={i + 1} />
              ))}
              {loading && (
                <div className="py-6">
                  <GenerationLoader system={designSystem} format={format} />
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* TheoroX watermark — fixed so it doesn't scroll away with the feed */}
          <div className="pointer-events-none fixed bottom-4 right-5 z-20 opacity-60">
            <PoweredBy />
          </div>
        </main>
      </div>
    </div>
  );
}
