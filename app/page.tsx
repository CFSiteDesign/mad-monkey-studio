"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeSvg, scopeSvgIds } from "@/lib/sanitize-svg";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SignOutButton } from "@/components/sign-out-button";
import { BrandLogo } from "@/components/brand-logo";
import { UploadPhotos, type UploadedImage } from "@/components/upload-photos";
import { extractTextFromFile } from "@/lib/extract-text";
import { GenerationLoader } from "@/components/generation-loader";
import { GenerationCard, type FeedGeneration } from "@/components/generation-card";
import { useGeneration } from "@/components/generation-provider";
import { PoweredBy } from "@/components/powered-by";
import { Walkthrough, type TourStep } from "@/components/walkthrough";
import { FORMAT_DIMENSIONS } from "@/lib/prompt";
import { LookPicker, LookPickerModal } from "@/components/look-picker";
import { lookByName } from "@/lib/looks";
import { readableBrief } from "@/lib/brief-display";
import {
  Loader2,
  Sparkles,
  ImageOff,
  Plus,
  Trash2,
  Wand2,
  ChevronLeft,
  ImagePlus,
  Presentation,
  ArrowRight,
  FileText,
  HelpCircle,
  Home,
  MessageSquare,
  Menu,
  Paperclip,
  X,
} from "lucide-react";

const FORMATS = [
  { id: "1:1", ratio: "aspect-square", name: "a Square" },
  { id: "4:5", ratio: "aspect-[4/5]", name: "Insta Post Size" },
  { id: "9:16", ratio: "aspect-[9/16]", name: "Story, Reel or TikTok shapes" },
  { id: "A4", ratio: "aspect-[794/1123]", name: "Poster" },
  { id: "whatsapp", ratio: "aspect-[4/5]", name: "Portrait chat image", title: "WhatsApp" },
  { id: "whatsapp-landscape", ratio: "aspect-[1600/1052]", name: "Landscape chat image", title: "WhatsApp", landscape: true },
] as const;

// The looks people pick from (with real examples) live in lib/looks.ts.

// The freshly-returned generation, shown until the thread query catches up.
const ASPECT: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "A4": "aspect-[794/1123]",
  whatsapp: "aspect-[4/5]", // WhatsApp chat image (1080×1350, shows in full in the bubble)
  "whatsapp-landscape": "aspect-[1600/1052]", // WhatsApp landscape chat image (1600×1052)
  "16:9": "aspect-[16/9]", // presentation slides (1920×1080)
  presentation: "aspect-[16/9]",
};

/** Pin the SVG's own preserveAspectRatio so the whole design fits centred in
 *  the tile in EVERY browser. `object-fit` is unreliable on an inline <svg>
 *  (Chrome/Safari recently began honouring it while others ignore it), so a
 *  stretched tile could suddenly crop the design to a strip — this makes the
 *  fit deterministic regardless of object-fit support. */
function fitThumb(svg: string): string {
  return svg.replace(/<svg\b([^>]*?)>/i, (m, a) =>
    /preserveAspectRatio/i.test(a) ? m : `<svg${a} preserveAspectRatio="xMidYMid meet">`,
  );
}

/** Sanitised SVG thumbnail for a past creation in the gallery. */
function GalleryThumb({ svg, format }: { svg: string; format: string }) {
  // Scope ids per tile — the gallery renders many SVGs in one document and they
  // would otherwise share `photoClip`/`hs`/`duo`/… (see scopeSvgIds).
  const uid = useId();
  const safe = useMemo(() => scopeSvgIds(fitThumb(sanitizeSvg(svg)), uid), [svg, uid]);
  return (
    <div
      className={`${ASPECT[format] ?? "aspect-square"} w-full overflow-hidden bg-white [&>svg]:h-full [&>svg]:w-full [&>svg]:object-contain`}
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
  // Deep link from the Experience Database (costing tool): the event fields
  // arrive prefilled and the finished export is posted back to that product.
  const [costingProduct, setCostingProduct] = useState<{ id: string; tour: string } | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const pid = q.get("product");
    if (q.get("source") !== "costing" || !pid) {
      // not a costing session: make sure a stale one can't post back later
      if (q.get("source") !== "costing") sessionStorage.removeItem("mm.costingProduct");
      return;
    }
    const tour = q.get("tour") ?? "";
    if (tour) setEventTitle(tour);
    const when = [q.get("day"), q.get("time")].filter(Boolean).join(", ");
    if (when) setEventDate(when);
    if (q.get("price")) setEventCost(q.get("price")!);
    if (q.get("location")) setEventLocation(q.get("location")!);
    if (q.get("desc")) setOtherDetails(q.get("desc")!);
    sessionStorage.setItem("mm.costingProduct", JSON.stringify({ id: pid, tour }));
    setCostingProduct({ id: pid, tour });
  }, []);
  const [format, setFormat] = useState<string>("1:1");
  // Remembers the last non-presentation format so toggling Presentation → Single
  // design restores what the user had, instead of snapping back to 1:1.
  const lastDesignFormatRef = useRef<string>("1:1");
  const [designSystem, setDesignSystem] = useState("brand");
  const [lookOpen, setLookOpen] = useState(false);
  // Logo and sticker choices sit behind "More options" (logo on by default).
  const [optionsOpen, setOptionsOpen] = useState(false);
  const currentLook = lookByName(designSystem);
  // Event templates are built for Story and WhatsApp landscape: picking one
  // while a format it wasn't made for is selected switches to its first.
  function pickLook(name: string) {
    setDesignSystem(name);
    const best = lookByName(name).bestFor;
    if (best && !best.includes(format) && format !== "presentation") setFormat(best[0]);
  }
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
  const [docText, setDocText] = useState("");
  const [docName, setDocName] = useState("");
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState("");
  const docInputRef = useRef<HTMLInputElement>(null);
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

  // Keep the "last design format" fresh so the top-level Single design ↔
  // Presentation toggle can restore the user's previous format.
  useEffect(() => {
    if (format !== "presentation") lastDesignFormatRef.current = format;
  }, [format]);

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
    { q: "What's the single biggest draw: the foam, the DJ, or the crowd?", hint: "endless foam + DJ" },
    { q: "Who's it for: current guests, or travellers still choosing a hostel?", hint: "current guests" },
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
      title: "1 · Pick a look",
      body: (
        <div className="space-y-1.5">
          <p>
            Every look is shown with real examples. Hover one to flip through them, click to pick it.
          </p>
          <p className="text-[#5E564F]">
            <b className="text-[#15110E]">Event templates</b> are built for tonight's event as a Story or a WhatsApp
            image. <b className="text-[#15110E]">Classic styles</b> are free-form Mad Monkey posters for any format.
          </p>
        </div>
      ),
      onEnter: () => setDesignSystem("brand"),
    },
    {
      target: '[data-tour="format"]',
      title: "2 · Choose the format",
      body: "Pick the size and the look adapts to it: 1:1, 4:5 or 9:16 for social, WhatsApp (portrait or landscape) for a chat-ready image, A4 for print. A coral dot marks the formats a look is built for.",
      onEnter: () => {
        setDesignSystem("brand");
        setFormat("4:5");
      },
    },
    {
      target: '[data-tour="event-fields"]',
      title: "3 · Answer a few basics",
      body: "Tell us about the event: title, date, location and the cost if there is one. Keep it factual. The AI turns it into the brief, so you never write one yourself.",
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
      body: "Instead of generating straight away, the AI reads your answers and asks 3 sharp follow-up questions about this event: the details that make the result land.",
      onEnter: () => restoreEventDemo(false),
    },
    {
      target: '[data-tour="followups"]',
      title: "5 · Answer the smart follow-ups",
      body: "These 3 are written for your exact event. Answer them in a few words for a noticeably better design, or use “skip the extra questions” if you're in a hurry.",
      onEnter: () => restoreEventDemo(true),
    },
    {
      target: '[data-tour="other-details"]',
      title: "6 · Any other details",
      body: "A catch-all for anything else: a must-have detail, a vibe, a call to action. Totally optional.",
      onEnter: () => {
        restoreEventDemo(true);
        setOtherDetails("Free shot for the first 50 through the door.");
      },
    },
    {
      target: '[data-tour="brand-marks"]',
      title: "7 · Logo and brand marks",
      body: "Open More options to choose the marks: the Mad Monkey logo, the ALL IN stickers or the Mad Monkey Stamp, in any combination. Hover a box to preview the mark. Event templates carry the logo only.",
      onEnter: () => {
        restoreEventDemo(true);
        setOptionsOpen(true);
        setIncludeAllIn(true);
      },
    },
    {
      target: '[data-tour="cta"]',
      title: "8 · Generate",
      body: "Hit Generate. About 30 seconds later you have a checked, on-brand design: no off-palette colours, no clipped text, no overlapping stickers.",
      onEnter: () => restoreEventDemo(true),
    },
    {
      target: '[data-tour="present-fields"]',
      title: "9 · Presentations",
      body: "Pick Presentation and you're building a full multi-slide deck. Give the topic and a slide count; the AI plans the outline and designs every slide on-brand, then exports straight to PowerPoint.",
      onEnter: () => {
        cancelTyping();
        setDesignSystem("brand");
        setFormat("presentation");
        setDeckSlides(8);
        void (async () => {
          await tourSleep(160);
          await typeFields(
            [[setDeckBrief, "Investor pitch for our Bali expansion: 3 new properties, the team, and the $4M ask."]],
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
            Click your avatar (up here) → <b className="text-[#15110E]">Image bank</b>. It's the shared library of
            real Mad Monkey photos: foam parties, pool days, dorms, beach runs.
          </p>
          <p className="text-[#5E564F]">
            Upload a shot with a short description and the AI automatically drops the best-matching photo into your
            designs. The more real photos it holds, the better every
            poster and deck looks.
          </p>
        </div>
      ),
    },
    {
      title: "That's everything. You're ALL IN 🐵",
      body: "You now know the whole tool: looks, formats, the smart questions, presentations, the gallery and the image bank. Replay this tour anytime from “How it works” in the top bar.",
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
  // Mobile only: the gallery becomes an off-canvas drawer (the desktop rail is
  // always shown via lg: classes). Closed by default on a phone.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
    clearDoc();
    resetBriefFlow();
    setMobileNavOpen(false);
  }

  function selectThread(id: Id<"threads">) {
    if (loading) return;
    setThreadId(id);
    clearResult();
    setBrief("");
    setLocalError("");
    setUserPhotos([]);
    setMobileNavOpen(false);
  }

  // Presentation: pull deck details from an uploaded document (PDF / Word / text).
  async function handleDocFile(file: File) {
    setDocError("");
    setDocBusy(true);
    setDocName(file.name);
    try {
      const text = await extractTextFromFile(file);
      if (!text || text.length < 20) {
        throw new Error("Couldn't find readable text in that file. Try a PDF or Word export, or paste the text.");
      }
      setDocText(text.slice(0, 16000)); // cap so the brief stays a sane size
    } catch (e) {
      setDocError(e instanceof Error ? e.message : "Couldn't read that file.");
      setDocName("");
      setDocText("");
    } finally {
      setDocBusy(false);
    }
  }

  function clearDoc() {
    setDocText("");
    setDocName("");
    setDocError("");
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
  const presentationReady = deckBrief.trim().length > 0 || docText.trim().length > 0;

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
    // Presentations skip it entirely — they're driven by the topic/document, not
    // the event follow-up questions, so they go straight to Build presentation.
    if (newCreation && briefStep === "base" && !opts?.skip && !isPresentation) {
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
        const base = [
          deckBrief.trim(),
          docText.trim() ? `Source document (${docName}) — pull the details, facts and structure from this:\n${docText.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        const enrichedBrief = extra.length
          ? `${base}\n\nAdditional context:\n${extra.join("\n")}`
          : base;
        const { deckId } = await generateDeck({
          brief: enrichedBrief,
          designSystem: "brand",
          slideCount: deckSlides,
        });
        setDeckBrief("");
        setUserPhotos([]);
        clearDoc();
        resetBriefFlow();
        router.push(`/presentation/${deckId}`);
      } catch (err) {
        // ConvexError carries a readable reason in `.data`; plain server errors
        // arrive masked, so fall back to a friendly line.
        const data = (err as { data?: unknown })?.data;
        setLocalError(
          typeof data === "string"
            ? data
            : "Couldn't build the presentation. Try again in a moment, or give a fuller brief.",
        );
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

  // Resize an existing design for another channel — Claude re-lays-out the same
  // design/copy/photos for the new format as a NEW asset. Brand marks are
  // carried over from whatever the original actually used.
  function handleResize(g: FeedGeneration, targetFormat: string) {
    if (loading || targetFormat === g.format) return;
    const code = g.outputCode;
    void runAsset({
      adaptFrom: { outputCode: code, fromFormat: g.format },
      format: targetFormat,
      designSystem: g.designSystem,
      includeLogo: /mm-logo-/.test(code),
      includeAllIn: /mm-allin\.png/.test(code),
      includeAllInMonkey: /mm-allin-monkey\.png/.test(code),
      includeStamp: /mm-stamp/.test(code),
    });
  }

  const charCount = brief.length;

  return (
    <div className="mm-ambient relative flex min-h-[100svh] flex-col dt:h-screen dt:overflow-hidden">
      {/* ── Header ── */}
      <header className="z-20 flex shrink-0 items-center justify-between gap-2 border-b border-[rgba(21,17,14,0.08)] bg-[#F7F3EC]/70 px-3 py-2.5 backdrop-blur-md sm:px-4 sm:py-3 lg:px-6 lg:py-3.5">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          {/* Mobile: open the gallery drawer */}
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open gallery"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#3A332D] transition-colors hover:bg-[rgba(21,17,14,0.06)] hover:text-[#15110E] dt:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandLogo className="block h-7 w-auto shrink-0 sm:h-8" />
          <span className="hidden h-6 w-px bg-[rgba(21,17,14,0.12)] sm:block" />
          <p
            className="hidden text-lg font-extrabold tracking-[-0.03em] leading-none text-[#15110E] sm:block"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Studio
          </p>
          {user?.role && (
            <span className="ml-1 hidden rounded-full border border-[rgba(21,17,14,0.1)] px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-[#5E564F] sm:inline">
              {user.role}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={createNew}
            className="flex items-center gap-1.5 rounded-full border border-[rgba(21,17,14,0.12)] p-2 text-[11px] text-[#3A332D] transition-colors hover:border-[#D2452B]/60 hover:text-[#15110E] sm:px-3 sm:py-1.5"
            title="Start fresh with a new design"
          >
            <Home className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">Home</span>
          </button>
          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLSdCGDQJTQHuj1OY3I8mAtQL7vyTAfK3Ym-gEmfQHjursAm1Vw/viewform"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-[rgba(21,17,14,0.12)] p-2 text-[11px] text-[#3A332D] transition-colors hover:border-[#D2452B]/60 hover:text-[#15110E] sm:px-3 sm:py-1.5"
            title="Share feedback (opens a form in a new tab)"
          >
            <MessageSquare className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">Feedback</span>
          </a>
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-[rgba(21,17,14,0.12)] p-2 text-[11px] text-[#3A332D] transition-colors hover:border-[#D2452B]/60 hover:text-[#15110E] sm:px-3 sm:py-1.5"
            title="Take the tour"
          >
            <HelpCircle className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">How it works</span>
          </button>
          <SignOutButton initials={initials} email={user?.email} role={user?.role} />
        </div>
      </header>

      <Walkthrough steps={TOUR_STEPS} open={tourOpen} onClose={closeTour} />

      {/* ── Body ── */}
      <div className="relative flex flex-1 flex-col overflow-visible dt:flex-row dt:overflow-hidden">
        {/* Mobile: dim backdrop behind the gallery drawer */}
        {mobileNavOpen && (
          <div
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm dt:hidden"
            aria-hidden
          />
        )}
        {/* ── Gallery sidebar — collapsible rail on desktop, slide-over drawer on mobile ── */}
        <aside
          data-tour="gallery"
          className={`fixed inset-y-0 left-0 z-40 flex w-[17rem] shrink-0 flex-col overflow-hidden border-r border-[#E4DCCF] bg-white shadow-2xl transition-transform duration-300 ease-in-out dt:relative dt:z-auto dt:translate-x-0 dt:bg-white dt:shadow-none dt:transition-[width] ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full dt:translate-x-0"
          } ${galleryOpen ? "dt:w-56 xl:w-64" : "dt:w-12"}`}
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
            {/* Mobile: close the drawer */}
            <button
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close gallery"
              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md text-[#5E564F] transition-colors hover:bg-[rgba(21,17,14,0.06)] hover:text-[#15110E] dt:hidden"
            >
              <X className="h-4 w-4" />
            </button>
            {/* Desktop: collapse the rail */}
            <button
              onClick={() => setGalleryOpen((o) => !o)}
              aria-label={galleryOpen ? "Collapse gallery" : "Expand gallery"}
              className="hidden h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md text-[#5E564F] transition-colors hover:bg-[rgba(21,17,14,0.06)] hover:text-[#15110E] dt:grid"
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
            className={`mm-cta absolute left-1/2 top-[3.25rem] hidden h-8 w-8 -translate-x-1/2 cursor-pointer place-items-center rounded-md text-[#F7F3EC] transition-opacity duration-200 disabled:opacity-40 dt:grid ${
              galleryOpen ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            <ImagePlus className="h-4 w-4" />
          </button>

          {/* Body — fixed width so it clips cleanly instead of reflowing as the rail shrinks */}
          <div
            className={`flex w-[17rem] min-h-0 flex-1 flex-col transition-opacity duration-200 dt:w-56 xl:w-64 ${
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
                <div className="flex items-center gap-2 px-1 py-2 text-xs text-[#5E564F]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D2452B]" />
                  Loading…
                </div>
              ) : threads.length === 0 ? (
                <p className="px-1 py-2 text-xs leading-relaxed text-[#5E564F]/70">
                  {failedCount > 0
                    ? `${failedCount} recent ${failedCount === 1 ? "run" : "runs"} didn't pass brand checks, so nothing's landed here yet. Only on-brand designs appear, so tweak the brief and try again.`
                    : "Nothing here yet. Hit Create something new and your first design lands here."}
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
                              ? "border-[#D2452B]/70 ring-1 ring-[#D2452B]/40"
                              : "border-[rgba(21,17,14,0.08)] hover:border-[rgba(21,17,14,0.25)]"
                          } ${loading ? "" : "cursor-pointer"}`}
                        >
                          {t.thumbnail ? (
                            <GalleryThumb svg={t.thumbnail} format={t.format} />
                          ) : (
                            <div className="grid aspect-square w-full place-items-center bg-[rgba(21,17,14,0.03)]">
                              <ImageOff className="h-5 w-5 text-[#5E564F]/50" />
                            </div>
                          )}
                          <p className="line-clamp-2 px-2 py-1.5 text-[11px] leading-snug text-[#3A332D]">
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
                          className="absolute right-1.5 top-1.5 grid h-6 w-6 cursor-pointer place-items-center rounded-md bg-[#F7F3EC]/80 text-[#5E564F] opacity-0 backdrop-blur transition-opacity hover:text-red-300 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>

                        {/* Are-you-sure overlay */}
                        {confirming && (
                          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-[#F7F3EC]/95 p-2 text-center backdrop-blur-sm">
                            <p className="text-[11px] font-medium leading-snug text-[#15110E]">
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
                                className="cursor-pointer rounded-md bg-[rgba(21,17,14,0.1)] px-2.5 py-1 text-[11px] font-medium text-[#15110E] transition-colors hover:bg-[rgba(21,17,14,0.18)]"
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
                          onClick={() => {
                            setMobileNavOpen(false);
                            router.push(`/presentation/${d._id}`);
                          }}
                          className="block w-full overflow-hidden rounded-lg border border-[rgba(21,17,14,0.08)] text-left transition-colors hover:border-[rgba(21,17,14,0.25)]"
                        >
                          {/* First slide as the thumbnail (16:9), same treatment as the design tiles */}
                          {d.status === "generating" ? (
                            <div className="grid aspect-[16/9] w-full place-items-center bg-[rgba(21,17,14,0.03)]">
                              <Loader2 className="h-4 w-4 animate-spin text-[#D2452B]" />
                            </div>
                          ) : d.thumbnail ? (
                            <GalleryThumb svg={d.thumbnail} format="16:9" />
                          ) : (
                            <div className="grid aspect-[16/9] w-full place-items-center bg-[rgba(21,17,14,0.03)]">
                              <Presentation className="h-5 w-5 text-[#5E564F]/50" />
                            </div>
                          )}
                          <span className="flex items-center gap-1.5 px-2 py-1.5 pr-8">
                            <Presentation className="h-3 w-3 shrink-0 text-[#D2452B]" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11px] font-medium text-[#3A332D]">
                                {d.title || "Untitled deck"}
                              </span>
                              <span className="block text-[10px] text-[#5E564F]">
                                {d.status === "generating"
                                  ? `${d.slidesDone}/${d.slideCount} slides…`
                                  : `${d.slidesDone} slides`}
                              </span>
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
                          className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-md bg-[#F7F3EC]/80 text-[#5E564F] opacity-0 backdrop-blur transition-opacity hover:text-red-300 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>

                        {/* Are-you-sure overlay */}
                        {confirmDeleteDeckId === d._id && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center gap-1.5 rounded-lg bg-[#F7F3EC]/95 px-2 backdrop-blur-sm">
                            <span className="text-[11px] font-medium text-[#15110E]">Delete?</span>
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
                              className="cursor-pointer rounded-md bg-[rgba(21,17,14,0.1)] px-2 py-1 text-[11px] font-medium text-[#15110E] transition-colors hover:bg-[rgba(21,17,14,0.18)]"
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
        <aside className="flex w-full shrink-0 flex-col border-b border-[#E4DCCF] bg-white dt:w-72 dt:overflow-y-auto dt:border-b-0 dt:border-r xl:w-80">
          <form onSubmit={handleGenerate} className="flex flex-1 flex-col">
            {/* Locked while a generation is in flight — nothing about the
                in-progress design can change mid-run. */}
            <fieldset
              disabled={loading}
              className={`m-0 flex flex-1 flex-col gap-6 border-0 p-5 transition-opacity [min-inline-size:0] xl:gap-7 xl:p-6 ${
                loading ? "pointer-events-none opacity-50" : ""
              }`}
            >
            {/* Top-level mode — pick what you're making. Presentation is its own
                mode: choosing it hides the design-system, format, event fields,
                follow-up questions and brand marks, and builds a deck in the one
                on-brand presentation style. Hidden while refining an existing design. */}
            {!threadId && (
              <div className="space-y-2.5" data-tour="mode">
                <label className="mm-eyebrow">What are you making?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { if (isPresentation) setFormat(lastDesignFormatRef.current); }}
                    aria-pressed={!isPresentation}
                    className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-all duration-200 cursor-pointer ${
                      !isPresentation
                        ? "border-[#D2452B]/70 bg-[#D2452B]/10"
                        : "border-[rgba(21,17,14,0.08)] hover:border-[rgba(21,17,14,0.2)]"
                    }`}
                  >
                    <span className={`flex items-center gap-2 text-sm font-medium ${!isPresentation ? "text-[#15110E]" : "text-[#3A332D]"}`}>
                      <Sparkles className="h-4 w-4 shrink-0" /> Single design
                    </span>
                    <span className="text-[11px] leading-tight text-[#5E564F]">Post, story or poster</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat("presentation")}
                    aria-pressed={isPresentation}
                    className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-all duration-200 cursor-pointer ${
                      isPresentation
                        ? "border-[#D2452B]/70 bg-[#D2452B]/10"
                        : "border-[rgba(21,17,14,0.08)] hover:border-[rgba(21,17,14,0.2)]"
                    }`}
                  >
                    <span className={`flex items-center gap-2 text-sm font-medium ${isPresentation ? "text-[#15110E]" : "text-[#3A332D]"}`}>
                      <Presentation className="h-4 w-4 shrink-0" /> Presentation
                    </span>
                    <span className="text-[11px] leading-tight text-[#5E564F]">Multi-slide deck</span>
                  </button>
                </div>
                {isPresentation && (
                  <div className="rounded-lg border border-[rgba(21,17,14,0.08)] bg-[rgba(21,17,14,0.02)] px-3 py-2.5">
                    <p className="text-[11px] font-medium text-[#3A332D]">On-brand slide deck (PowerPoint export)</p>
                    <p className="mt-0.5 font-mono text-[10px] text-[#5E564F]">1920 × 1080 px · landscape · {deckSlides} slides</p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[#5E564F]">
                      One consistent presentation style: just the topic or a document, no other questions.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Look — a real example of the selected style; opens the visual
                picker. Hidden while refining (a refinement keeps the look) and
                for presentations (one fixed deck style). */}
            {!threadId && !isPresentation && (
              <div className="space-y-2.5" data-tour="design-system">
                <div className="flex items-center justify-between">
                  <span className="mm-eyebrow">Look</span>
                  <button
                    type="button"
                    onClick={() => setLookOpen(true)}
                    className="cursor-pointer text-[12px] font-semibold text-[#15110E] underline decoration-[#E8553A] decoration-2 underline-offset-4 transition-colors hover:text-[#D2452B]"
                  >
                    See all looks
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setLookOpen(true)}
                  className="group flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-[#E4DCCF] bg-white p-2 pr-3 text-left transition-all hover:border-[#CFC4B4] hover:shadow-[0_10px_24px_-18px_rgba(21,17,14,0.4)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentLook.examples[0].src}
                    alt=""
                    className="h-[68px] w-[54px] shrink-0 rounded-xl object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-tight text-[#15110E]">{currentLook.label}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-[#5E564F]">{currentLook.desc}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-[#E4DCCF] px-3 py-1 text-[12px] font-semibold text-[#15110E] transition-colors group-hover:border-[#15110E]">
                    Change
                  </span>
                </button>
              </div>
            )}

            {/* Event details / Refine */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor={threadId ? "brief" : isPresentation ? "deck-brief" : "event-title"} className="mm-eyebrow">
                  {threadId ? "Refine" : isPresentation ? "Presentation details" : "Event details"}
                </label>
                {threadId && (
                  <span className="text-[10px] tabular-nums text-[#5E564F]/60">
                    {charCount}
                  </span>
                )}
              </div>

              {/* Conversation so far — briefs sent in this chat */}
              {threadId && activeThread && activeThread.briefs.length > 0 && (
                <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-lg border border-[rgba(21,17,14,0.08)] bg-[rgba(21,17,14,0.02)] p-2.5">
                  {activeThread.briefs.map((b) => (
                    <p
                      key={b.id}
                      className="border-l-2 border-[#D2452B]/40 pl-2 text-[11px] leading-relaxed text-[#5E564F]"
                    >
                      {readableBrief(b.content)}
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
                  className="mm-field w-full resize-none rounded-lg px-3.5 py-3 text-sm leading-relaxed text-[#15110E] placeholder:text-[#5E564F]/55"
                />
              ) : isPresentation ? (
                <div className="space-y-3" data-tour="present-fields">
                  <div className="space-y-1.5">
                    <label htmlFor="deck-brief" className="block text-[11px] font-medium text-[#3A332D]">
                      What is the presentation about?
                    </label>
                    <textarea
                      id="deck-brief"
                      value={deckBrief}
                      onChange={(e) => setDeckBrief(e.target.value)}
                      rows={5}
                      spellCheck
                      placeholder={`Topic, audience, and the key points / numbers to cover. e.g. Investor pitch for Mad Monkey Bali expansion: 3 new properties, 2027 target, occupancy and revenue highlights, the team, and the ask of $2M.`}
                      className="mm-field w-full resize-none rounded-lg px-3.5 py-3 text-sm leading-relaxed text-[#15110E] placeholder:text-[#5E564F]/55"
                    />
                  </div>
                  {/* Add a document — Claude pulls the deck details from it */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-[#3A332D]">
                      Or add a document{" "}
                      <span className="text-[#5E564F]">· optional: PDF, Word, Markdown or text</span>
                    </label>
                    {docName ? (
                      <div className="flex items-center gap-2 rounded-lg border border-[rgba(21,17,14,0.1)] bg-[rgba(21,17,14,0.03)] px-3 py-2">
                        {docBusy ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#D2452B]" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 shrink-0 text-[#D2452B]" />
                        )}
                        <span className="flex-1 truncate text-[12px] text-[#3A332D]">
                          {docName}
                          {docBusy ? " · reading…" : docText ? ` · ${docText.split(/\s+/).length} words` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={clearDoc}
                          className="shrink-0 text-[#5E564F] transition-colors hover:text-[#15110E]"
                          aria-label="Remove document"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => docInputRef.current?.click()}
                        className="flex items-center gap-1.5 rounded-lg border border-dashed border-[rgba(21,17,14,0.2)] px-3 py-2 text-[12px] text-[#5E564F] transition-colors hover:border-[#D2452B]/60 hover:text-[#3A332D]"
                      >
                        <Paperclip className="h-3.5 w-3.5" /> Add file
                      </button>
                    )}
                    {docError && <p className="text-[11px] leading-relaxed text-red-300">{docError}</p>}
                    <input
                      ref={docInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt,.md,.csv,.rtf,application/pdf,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleDocFile(f);
                        e.target.value = "";
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="deck-slides" className="block text-[11px] font-medium text-[#3A332D]">
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
                        className="mm-field w-20 rounded-lg px-3.5 py-2.5 text-sm text-[#15110E]"
                      />
                      <span className="text-[11px] text-[#5E564F]">slides (3–14) · Claude plans the rest</span>
                    </div>
                  </div>
                  <UploadPhotos images={userPhotos} onChange={setUserPhotos} />
                </div>
              ) : (
                <div className="space-y-2" data-tour="event-fields">
                  {costingProduct && (
                    <div className="rounded-lg border border-[#FFC72C]/40 bg-[#FFC72C]/10 px-3 py-2 text-xs text-[#15110E]">
                      Prefilled from the Experience Database: <span className="font-semibold">{costingProduct.tour}</span>.
                      When you export, the finished file is saved back to that experience automatically.
                    </div>
                  )}
                  <input
                    id="event-title"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    spellCheck
                    placeholder="Event title, e.g. Foam Party"
                    className="mm-field w-full rounded-lg px-3.5 py-2.5 text-sm text-[#15110E] placeholder:text-[#5E564F]/55"
                  />
                  <input
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    placeholder="Date and time, e.g. Friday 4th July, 10pm"
                    className="mm-field w-full rounded-lg px-3.5 py-2.5 text-sm text-[#15110E] placeholder:text-[#5E564F]/55"
                  />
                  <input
                    value={eventCost}
                    onChange={(e) => setEventCost(e.target.value)}
                    placeholder="Cost (optional), e.g. $9 or free entry"
                    className="mm-field w-full rounded-lg px-3.5 py-2.5 text-sm text-[#15110E] placeholder:text-[#5E564F]/55"
                  />
                  <input
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    spellCheck
                    placeholder="Location, e.g. Mad Monkey Uluwatu, Bali"
                    className="mm-field w-full rounded-lg px-3.5 py-2.5 text-sm text-[#15110E] placeholder:text-[#5E564F]/55"
                  />
                  <UploadPhotos images={userPhotos} onChange={setUserPhotos} />
                </div>
              )}

              {/* Smart follow-up questions (Haiku) — new creations only */}
              {!threadId && briefStep === "followup" && (
                <div data-tour="followups" className="space-y-3 rounded-lg border border-[rgba(21,17,14,0.1)] bg-[#FFFFFF]/50 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium text-[#3A332D]">
                      A few more questions for a sharper result{" "}
                      <span className="text-[#5E564F]">· optional</span>
                    </p>
                    <button
                      type="button"
                      onClick={resetBriefFlow}
                      className="text-[10px] text-[#5E564F] transition-colors hover:text-[#3A332D]"
                    >
                      ← edit basics
                    </button>
                  </div>
                  {followUps.length === 0 ? (
                    <p className="text-[11px] leading-relaxed text-[#5E564F]">
                      Couldn’t fetch extra questions. Add any details below, or just generate.
                    </p>
                  ) : (
                    followUps.map((f, i) => (
                      <div key={i} className="space-y-1">
                        <label className="block text-[11px] leading-snug text-[#3A332D]">{f.q}</label>
                        <input
                          value={followUpAnswers[i] ?? ""}
                          onChange={(e) =>
                            setFollowUpAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))
                          }
                          placeholder={f.hint ? `e.g. ${f.hint}` : "Your answer…"}
                          className="mm-field w-full rounded-lg px-3 py-2 text-sm text-[#15110E] placeholder:text-[#5E564F]/55"
                        />
                      </div>
                    ))
                  )}
                  <div className="space-y-1" data-tour="other-details">
                    <label className="block text-[11px] text-[#3A332D]">
                      Any other details? <span className="text-[#5E564F]">· optional</span>
                    </label>
                    <textarea
                      value={otherDetails}
                      onChange={(e) => setOtherDetails(e.target.value)}
                      rows={2}
                      spellCheck
                      placeholder="Anything else that should shape the design…"
                      className="mm-field w-full resize-none rounded-lg px-3 py-2 text-sm leading-relaxed text-[#15110E] placeholder:text-[#5E564F]/55"
                    />
                  </div>
                </div>
              )}

              {/* Brand marks — new creations only (a refinement keeps the marks
                  already on the design), tucked behind "More options". Event
                  templates and Minimal Bold only ever carry the wordmark, so
                  they offer just the logo. Hover a checkbox to preview the mark. */}
              {!isPresentation && !threadId && (
              <div data-tour="brand-marks" className="rounded-xl border border-[#E4DCCF]">
                <button
                  type="button"
                  onClick={() => setOptionsOpen((o) => !o)}
                  aria-expanded={optionsOpen}
                  className="flex w-full cursor-pointer items-center justify-between px-3 py-2.5 text-left text-[12px] font-semibold text-[#15110E]"
                >
                  <span>
                    More options
                    <span className="ml-2 font-normal text-[#5E564F]">
                      {[
                        includeLogo && "logo",
                        includeAllIn && "ALL IN sticker",
                        includeAllInMonkey && "ALL IN monkey sticker",
                        includeStamp && "stamp",
                      ]
                        .filter(Boolean)
                        .join(", ") || "no marks"}
                    </span>
                  </span>
                  <ChevronLeft className={`h-4 w-4 text-[#5E564F] transition-transform ${optionsOpen ? "rotate-90" : "-rotate-90"}`} />
                </button>
                {optionsOpen && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#E4DCCF] px-3 py-2.5">
                {(
                  [
                    { label: "Mad Monkey logo", src: "/mm-logo-white.png", checked: includeLogo, set: setIncludeLogo, sticker: false },
                    { label: "ALL IN sticker", src: "/mm-allin.png", checked: includeAllIn, set: setIncludeAllIn, sticker: true },
                    { label: "ALL IN Mad Monkey Hostels sticker", src: "/mm-allin-monkey.png", checked: includeAllInMonkey, set: setIncludeAllInMonkey, sticker: true },
                    { label: "Mad Monkey Stamp", src: "/mm-stamp.png", checked: includeStamp, set: setIncludeStamp, sticker: true },
                  ] as const
                ).filter((opt) => !opt.sticker || (currentLook.group === "classic" && currentLook.name !== "minimal-bold")).map((opt) => (
                  <label
                    key={opt.label}
                    className="flex cursor-pointer items-center gap-2 text-xs text-[#3A332D]"
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
                      className="h-3.5 w-3.5 cursor-pointer accent-[#D2452B]"
                    />
                    {opt.label}
                  </label>
                ))}
                </div>
                )}
              </div>
              )}

              {/* Floating brand-mark preview — follows the cursor on checkbox hover */}
              {markHover && (
                <div
                  className="pointer-events-none fixed z-50 flex flex-col items-center rounded-lg border border-[rgba(21,17,14,0.15)] bg-[#FFFFFF] p-2 shadow-2xl"
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
                  <p className="mt-1.5 w-28 text-center text-[10px] leading-tight text-[#3A332D]">
                    {markHover.label}
                  </p>
                </div>
              )}

              {(threadId || isPresentation) && (
                <p className="text-[11px] text-[#5E564F]">
                  {threadId
                    ? "Refinements keep the current design and change what you ask for."
                    : "Claude outlines the deck and designs every slide on-brand, then you can export to PowerPoint."}
                </p>
              )}
            </div>

            {/* Format — hidden while refining (a refinement keeps it) and for
                presentations (a deck is always 16:9). */}
            {!threadId && !isPresentation && (
            <div className="space-y-2.5" data-tour="format">
              <label className="mm-eyebrow">Format</label>
              <div className="grid grid-cols-2 gap-2">
                {FORMATS.map((f) => {
                  const { id, ratio, name } = f;
                  const title = "title" in f ? f.title : id;
                  const landscape = "landscape" in f && f.landscape;
                  const active = format === id;
                  const best = currentLook.bestFor?.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFormat(id)}
                      aria-pressed={active}
                      title={FORMAT_DIMENSIONS[id]?.label ?? id}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all duration-200 ${
                        active
                          ? "border-[#D2452B]/70 bg-[#D2452B]/10"
                          : "border-[rgba(21,17,14,0.08)] hover:border-[rgba(21,17,14,0.2)]"
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                        <span
                          className={`${ratio} rounded-[3px] border ${landscape ? "h-auto" : "w-auto"} ${
                            active
                              ? "border-[#D2452B] bg-[#D2452B]/25"
                              : "border-[#5E564F]/50 bg-[rgba(21,17,14,0.04)]"
                          }`}
                          style={landscape ? { width: "1.7rem" } : { height: "1.6rem" }}
                        />
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`block text-[12px] font-semibold leading-tight ${
                            active ? "text-[#15110E]" : "text-[#3A332D]"
                          }`}
                        >
                          {title}
                        </span>
                        <span className="block text-[10px] leading-tight text-[#5E564F]">
                          {name}
                        </span>
                      </span>
                      {best && (
                        <span
                          className="ml-auto h-2 w-2 shrink-0 self-start rounded-full bg-[#E8553A]"
                          title={`Best for ${currentLook.label}`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {currentLook.bestFor && (
                <p className="flex items-center gap-2 text-[11px] text-[#5E564F]">
                  <span className="h-2 w-2 rounded-full bg-[#E8553A]" /> Best formats for {currentLook.label}
                </p>
              )}

              {/* Selected-format intent — what Claude will design for */}
              {FORMAT_DIMENSIONS[format] && (
                <div className="rounded-lg border border-[rgba(21,17,14,0.08)] bg-[rgba(21,17,14,0.02)] px-3 py-2.5">
                  <p className="text-[11px] font-medium text-[#3A332D]">
                    {FORMAT_DIMENSIONS[format].useCase}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#5E564F]">
                    {FORMAT_DIMENSIONS[format].w} × {FORMAT_DIMENSIONS[format].h} px ·{" "}
                    {FORMAT_DIMENSIONS[format].orientation}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#5E564F]">
                    Layout locked to this format before your brief drops in.
                  </p>
                </div>
              )}
            </div>
            )}

            <div className="hidden dt:block dt:flex-1" />

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
                ) : isPresentation ? (
                  <>
                    <Presentation className="h-4 w-4" /> Build presentation
                  </>
                ) : briefStep === "base" ? (
                  <>
                    Continue <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate
                  </>
                )}
              </button>

              {/* Skip the extra questions straight to generate (base step only —
                  presentations have no follow-up step). */}
              {!threadId && !isPresentation && briefStep === "base" && baseReady && !loading && !loadingFollowUps && (
                <button
                  type="button"
                  onClick={() => handleGenerate(undefined, { skip: true })}
                  className="w-full text-center text-[11px] text-[#5E564F] transition-colors hover:text-[#3A332D]"
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
          className="relative flex min-h-[60svh] w-full flex-1 flex-col bg-[#F7F3EC] p-4 sm:p-6 dt:min-h-0 dt:overflow-y-auto xl:p-10"
          style={{
            // Spotted's quiet dot field: 24px grid of soft ink dots.
            backgroundImage: "radial-gradient(rgba(21,17,14,0.12) 1px, transparent 1.4px)",
            backgroundSize: "24px 24px",
          }}
        >
          {threadLoading && feed.length === 0 && !loading ? (
            <div className="m-auto flex items-center gap-2 text-sm text-[#5E564F]">
              <Loader2 className="h-4 w-4 animate-spin text-[#D2452B]" />
              Loading chat…
            </div>
          ) : feed.length === 0 && !loading && isPresentation ? (
            <div className="m-auto max-w-md text-center">
              <h2 className="mm-display text-[40px]">
                Your deck lands here<span className="text-[#E8553A]">.</span>
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[#5E564F]">
                Tell Claude what the presentation is about, or add a document, then hit Build presentation.
              </p>
            </div>
          ) : feed.length === 0 && !loading ? (
            /* First visit to a new design: the canvas is the look gallery, so
               people see real examples before they type a word. */
            <div className="mm-fade-up mx-auto w-full max-w-5xl py-2">
              <h2 className="mm-display text-[40px] sm:text-[56px]">
                Pick a look<span className="text-[#E8553A]">.</span>
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#5E564F]">
                Every card shows real examples, so hover one to flip through them. Then add your event details and the Studio designs it in about 30 seconds.
              </p>
              <LookPicker className="mt-8" value={designSystem} onChange={pickLook} />
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-10 pb-8 sm:gap-14">
              {feed.map((g, i) => (
                <GenerationCard
                  key={g.id}
                  gen={g}
                  version={i + 1}
                  onResize={(fmt) => handleResize(g, fmt)}
                />
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
      <LookPickerModal
        open={lookOpen}
        value={designSystem}
        onChange={pickLook}
        onClose={() => setLookOpen(false)}
      />
    </div>
  );
}
