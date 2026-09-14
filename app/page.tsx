"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { sanitizeSvg, scopeSvgIds } from "@/lib/sanitize-svg";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { UploadPhotos, type UploadedImage } from "@/components/upload-photos";
import { extractTextFromFile } from "@/lib/extract-text";
import { GenerationLoader } from "@/components/generation-loader";
import { GenerationCard, type FeedGeneration } from "@/components/generation-card";
import { TemplatePicker } from "@/components/template-picker";
import { StudioHeader } from "@/components/studio-header";
import { ComposerFrame } from "@/components/composer-frame";
import { useGeneration } from "@/components/generation-provider";
import { PoweredBy } from "@/components/powered-by";
import { Walkthrough, type TourStep } from "@/components/walkthrough";
import { FORMAT_DIMENSIONS } from "@/lib/prompt";
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
  Paperclip,
  X,
} from "lucide-react";

const FORMATS = [
  { id: "1:1", ratio: "aspect-square", name: "Square" },
  { id: "4:5", ratio: "aspect-[4/5]", name: "Insta post" },
  { id: "9:16", ratio: "aspect-[9/16]", name: "Story" },
  { id: "A4", ratio: "aspect-[794/1123]", name: "A4 poster" },
] as const;

// The freshly-returned generation, shown until the thread query catches up.
const ASPECT: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "A4": "aspect-[794/1123]",
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

  // ── Composer modal — every NEW creation starts here: step 1 pick a template
  // (or blank / presentation), step 2 the details, step 3 the smart questions.
  // Refinements of an existing design stay inline in the left panel.
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerStep, setComposerStep] = useState<"template" | "details">("template");
  const [stepDir, setStepDir] = useState<"fwd" | "back">("fwd");
  const [templateId, setTemplateId] = useState<Id<"templates"> | null>(null);
  const templatesData = useQuery(api.templates.listTemplates);
  const templateMeta = useMemo(
    () => (templateId ? (templatesData?.templates ?? []).find((t) => t._id === templateId) ?? null : null),
    [templateId, templatesData],
  );
  // GMs (role "user") create from approved templates only; marketing + admins get the full tool.
  const canFreeform = user?.role === "admin" || user?.role === "marketing";
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
    setComposerOpen(false);
    setComposerStep("template");
    setTemplateId(null);
    if (typeof window !== "undefined") localStorage.setItem("mm-tour-v1", "1");
  }
  // Auto-launch once for first-time users.
  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    if (!localStorage.getItem("mm-tour-v1")) {
      const t = setTimeout(() => setTourOpen(true), 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  // One tour, filtered by role: GMs never see sizes, marks or presentations.
  const TOUR_STEPS: TourStep[] = (
    [
      {
        title: "Welcome to Mad Monkey Studio 🐵",
        body: "A quick tour: pick a template, add your event, answer a couple of questions. Use the buttons or your ← → arrow keys.",
        onEnter: () => {
          resetDemo();
          setStepDir("fwd");
          setComposerStep("template");
        },
      },
      {
        target: '[data-tour="templates"]',
        title: "Pick a template",
        body: "Every template is an approved design. Yours keeps its look and layout, so you never start from a blank page.",
        onEnter: () => {
          cancelTyping();
          setStepDir("back");
          setComposerStep("template");
        },
      },
      {
        target: '[data-tour="event-fields"]',
        title: "Add your event",
        body: "Title, when, where and the price. Keep it factual: the AI writes the brief and swaps every word on the template for yours.",
        onEnter: () => {
          cancelTyping();
          setStepDir("fwd");
          setComposerStep("details");
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
      canFreeform && {
        target: '[data-tour="format"]',
        title: "Choose the size",
        body: "Square, Insta post, Story or A4 poster. The layout adapts to the size before a word is written.",
        onEnter: () => {
          setComposerStep("details");
          restoreEventDemo(false);
        },
      },
      {
        target: '[data-tour="cta"]',
        title: "Hit Continue",
        body: "The AI reads your answers and asks three sharp follow-up questions tailored to this event.",
        onEnter: () => {
          setComposerStep("details");
          restoreEventDemo(false);
        },
      },
      {
        target: '[data-tour="followups"]',
        title: "Answer the smart follow-ups",
        body: "Generated for your exact event. A few words each makes a noticeably better design, or skip them if you're in a hurry.",
        onEnter: () => restoreEventDemo(true),
      },
      {
        target: '[data-tour="other-details"]',
        title: "Any other details",
        body: "A must-have detail, a vibe, a call to action. Optional.",
        onEnter: () => {
          restoreEventDemo(true);
          setOtherDetails("Free shot for the first 50 through the door.");
        },
      },
      canFreeform && {
        target: '[data-tour="brand-marks"]',
        title: "Logo and brand marks",
        body: "Tick the Mad Monkey logo, the ALL IN stickers or the stamp, in any combination. Hover a box to preview it.",
        onEnter: () => {
          restoreEventDemo(true);
          setIncludeAllIn(true);
        },
      },
      {
        target: '[data-tour="cta"]',
        title: "Generate",
        body: "About 20 seconds later you have a validated, on-brand design: no off-palette colours, no clipped text, no overlapping stickers.",
        onEnter: () => restoreEventDemo(true),
      },
      canFreeform && {
        target: '[data-tour="present-fields"]',
        title: "Presentations",
        body: "Give a topic and a slide count. The AI plans the outline, designs every slide on-brand, then exports to PowerPoint.",
        onEnter: () => {
          cancelTyping();
          setTemplateId(null);
          setComposerStep("details");
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
        title: "Your gallery",
        body: "Everything you create lands here. Open one to refine it in plain English, hand-edit it with Quick Fix, or export PNG, JPG, PDF or PowerPoint.",
      },
      {
        target: '[data-tour="account-menu"]',
        title: "The image bank",
        body: (
          <div className="space-y-1.5">
            <p>
              Click your avatar (up here) → <b className="text-[#F2EEE6]">Image bank</b>. It's the shared library of
              real Mad Monkey photos.
            </p>
            <p className="text-[#8C8278]">
              Upload a shot with a short description and the AI drops the best-matching photo into your designs.
              The more real photos it holds, the better every poster looks.
            </p>
          </div>
        ),
      },
      {
        title: "That's everything, you're ALL IN 🐵",
        body: "Replay this anytime from “How it works” in the top bar.",
      },
    ] as (TourStep | false)[]
  ).filter((x): x is TourStep => Boolean(x));

  // ── Gallery (past creations) ──
  const threads = useQuery(api.threads.list);
  const decks = useQuery(api.decksInternal.listDecks, canFreeform ? {} : "skip");
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

  function pickTemplate(t: { _id: Id<"templates">; format: string; designSystem: string }) {
    setTemplateId(t._id);
    setFormat(t.format);
    setDesignSystem(t.designSystem);
    setStepDir("fwd");
    setComposerStep("details");
  }
  function pickBlank() {
    setTemplateId(null);
    if (format === "presentation") setFormat(lastDesignFormatRef.current);
    setStepDir("fwd");
    setComposerStep("details");
  }
  function pickPresentation() {
    setTemplateId(null);
    setFormat("presentation");
    setStepDir("fwd");
    setComposerStep("details");
  }
  function backToTemplates() {
    setStepDir("back");
    setComposerStep("template");
  }
  function closeComposer() {
    setComposerOpen(false);
  }
  const isComposerModal = !threadId && composerOpen;

  // The tour spotlights fields that live inside the composer, so opening it
  // brings the composer up: marketing straight to the details step, GMs to
  // the template step.
  useEffect(() => {
    if (!tourOpen || threadId) return;
    setTemplateId(null);
    setStepDir("fwd");
    setComposerStep("template");
    setComposerOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen]);

  // Escape closes the composer.
  useEffect(() => {
    if (!isComposerModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setComposerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isComposerModal]);

  // Deep link from /templates: /?template=<id> opens the composer on step 2 with it picked.
  useEffect(() => {
    if (!templatesData) return;
    const id = new URLSearchParams(window.location.search).get("template");
    if (!id) return;
    const t = templatesData.templates.find((x) => x._id === id);
    if (!t) return;
    createNew(true);
    pickTemplate(t);
    window.history.replaceState(null, "", "/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templatesData]);

  function createNew(openComposer = true) {
    setThreadId(null);
    clearResult();
    setBrief("");
    setLocalError("");
    setUserPhotos([]);
    clearDoc();
    resetBriefFlow();
    setMobileNavOpen(false);
    setTemplateId(null);
    setStepDir("fwd");
    setComposerStep("template");
    setComposerOpen(Boolean(openComposer));
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
        throw new Error("Couldn't find readable text in that file — try a PDF/Word export, or paste the text.");
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
      setComposerOpen(false);
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
        setComposerOpen(false);
        router.push(`/presentation/${deckId}`);
      } catch (err) {
        // ConvexError carries a readable reason in `.data`; plain server errors
        // arrive masked, so fall back to a friendly line.
        const data = (err as { data?: unknown })?.data;
        setLocalError(
          typeof data === "string"
            ? data
            : "Couldn't build the presentation — try again in a moment, or give a fuller brief.",
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
    // Let people watch the canvas while it builds; if it fails, bring the
    // composer back with everything still filled in.
    setComposerOpen(false);
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
            templateStyle: templateMeta?.name,
          },
      format,
      designSystem,
      threadId: threadId ?? undefined,
      templateId: templateId ?? undefined,
      includeLogo,
      includeAllIn,
      includeAllInMonkey,
      includeStamp,
    });
    // Runs only if the page is still mounted — the provider holds the result +
    // thread regardless. Clears the brief form for the next creation.
    if (res) {
      setThreadId(res.threadId);
      setComposerOpen(false);
      setTemplateId(null);
      setBrief("");
      setEventTitle("");
      setEventDate("");
      setEventCost("");
      setEventLocation("");
      setUserPhotos([]);
      resetBriefFlow();
    } else if (!threadId) {
      setComposerOpen(true);
      setComposerStep("details");
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

  // The composer form is shared by the sheet (new design) and the inline
  // refine panel (existing thread).
  const composerForm = (
          <form onSubmit={handleGenerate} className={`flex min-h-0 flex-1 flex-col ${isComposerModal ? "mm-step-in" : ""}`}>
            {/* Locked while a generation is in flight — nothing about the
                in-progress design can change mid-run. */}
            <fieldset
              disabled={loading}
              className={`m-0 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto border-0 transition-opacity [min-inline-size:0] xl:gap-7 ${isComposerModal ? "px-5 py-6 sm:px-10 lg:px-24" : "p-5"} ${
                loading ? "pointer-events-none opacity-50" : ""
              }`}
            >
            {templateMeta && !threadId && (
              <div className="flex items-center gap-3 rounded-xl border border-[#CC7A5C]/30 bg-[#CC7A5C]/5 p-2.5">
                {templateMeta.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={templateMeta.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="mm-eyebrow">Template</p>
                  <p className="truncate text-sm text-[#F2EEE6]">{templateMeta.name}</p>
                </div>
                <button type="button" onClick={backToTemplates} className="cursor-pointer rounded-md px-2 py-1 text-[11px] text-[#8C8278] transition-colors hover:bg-[rgba(242,238,230,0.06)] hover:text-[#F2EEE6]">
                  Change
                </button>
              </div>
            )}
            {/* Top-level mode — pick what you're making. Presentation is its own
                mode: choosing it hides the design-system, format, event fields,
                follow-up questions and brand marks, and builds a deck in the one
                on-brand presentation style. Hidden while refining an existing design. */}
            {!threadId && !templateId && canFreeform && (
              <div className="space-y-2.5" data-tour="mode">
                <label className="mm-eyebrow">What are you making?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { if (isPresentation) setFormat(lastDesignFormatRef.current); }}
                    aria-pressed={!isPresentation}
                    className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-all duration-200 cursor-pointer ${
                      !isPresentation
                        ? "border-[#CC7A5C]/70 bg-[#CC7A5C]/10"
                        : "border-[rgba(242,238,230,0.08)] hover:border-[rgba(242,238,230,0.2)]"
                    }`}
                  >
                    <span className={`flex items-center gap-2 text-sm font-medium ${!isPresentation ? "text-[#F2EEE6]" : "text-[#CFC8BD]"}`}>
                      <Sparkles className="h-4 w-4 shrink-0" /> Single design
                    </span>
                    <span className="text-[11px] leading-tight text-[#8C8278]">Post, story or poster</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat("presentation")}
                    aria-pressed={isPresentation}
                    className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-all duration-200 cursor-pointer ${
                      isPresentation
                        ? "border-[#CC7A5C]/70 bg-[#CC7A5C]/10"
                        : "border-[rgba(242,238,230,0.08)] hover:border-[rgba(242,238,230,0.2)]"
                    }`}
                  >
                    <span className={`flex items-center gap-2 text-sm font-medium ${isPresentation ? "text-[#F2EEE6]" : "text-[#CFC8BD]"}`}>
                      <Presentation className="h-4 w-4 shrink-0" /> Presentation
                    </span>
                    <span className="text-[11px] leading-tight text-[#8C8278]">Multi-slide deck</span>
                  </button>
                </div>
                {isPresentation && (
                  <div className="rounded-lg border border-[rgba(242,238,230,0.08)] bg-[rgba(242,238,230,0.02)] px-3 py-2.5">
                    <p className="text-[11px] font-medium text-[#CFC8BD]">On-brand slide deck (PowerPoint export)</p>
                    <p className="mt-0.5 font-mono text-[10px] text-[#8C8278]">1920 × 1080 px · landscape · {deckSlides} slides</p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[#8C8278]">
                      One consistent presentation style — just the topic or a document, no other questions.
                    </p>
                  </div>
                )}
              </div>
            )}

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
                  {/* Add a document — Claude pulls the deck details from it */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-[#CFC8BD]">
                      Or add a document{" "}
                      <span className="text-[#8C8278]">· optional — PDF, Word, Markdown or text</span>
                    </label>
                    {docName ? (
                      <div className="flex items-center gap-2 rounded-lg border border-[rgba(242,238,230,0.1)] bg-[rgba(242,238,230,0.03)] px-3 py-2">
                        {docBusy ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#CC7A5C]" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 shrink-0 text-[#CC7A5C]" />
                        )}
                        <span className="flex-1 truncate text-[12px] text-[#CFC8BD]">
                          {docName}
                          {docBusy ? " — reading…" : docText ? ` · ${docText.split(/\s+/).length} words` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={clearDoc}
                          className="shrink-0 text-[#8C8278] transition-colors hover:text-[#F2EEE6]"
                          aria-label="Remove document"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => docInputRef.current?.click()}
                        className="flex items-center gap-1.5 rounded-lg border border-dashed border-[rgba(242,238,230,0.2)] px-3 py-2 text-[12px] text-[#8C8278] transition-colors hover:border-[#CC7A5C]/60 hover:text-[#CFC8BD]"
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
                  {costingProduct && (
                    <div className="rounded-lg border border-[#FFC72C]/40 bg-[#FFC72C]/10 px-3 py-2 text-xs text-[#F2EEE6]">
                      Prefilled from the Experience Database — <span className="font-semibold">{costingProduct.tour}</span>.
                      When you export, the finished file is saved back to that experience automatically.
                    </div>
                  )}
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
              {!isPresentation && !threadId && canFreeform && (
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
                  : ""}
              </p>
            </div>

            {/* Size: any fresh design can be any size; the template only sets the default. */}
            {!threadId && !isPresentation && (
            <div className="space-y-2.5" data-tour="format">
              <label className="mm-eyebrow">Size</label>
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-[rgba(242,238,230,0.035)] p-1">
                {FORMATS.map(({ id, ratio, name }) => {
                  const active = format === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFormat(id)}
                      aria-pressed={active}
                      title={FORMAT_DIMENSIONS[id]?.label ?? id}
                      className={`mm-press flex cursor-pointer flex-col items-center gap-1.5 rounded-lg px-1 py-2.5 transition-colors duration-200 ${
                        active ? "bg-[rgba(242,238,230,0.09)] text-[#F2EEE6] shadow-[0_1px_0_rgba(242,238,230,0.06)_inset]" : "text-[#8C8278] hover:text-[#CFC8BD]"
                      }`}
                    >
                      <span className="flex h-7 items-center">
                        <span
                          className={`${ratio} rounded-[3px] border transition-colors duration-200 ${
                            active ? "border-[#CC7A5C] bg-[#CC7A5C]/25" : "border-[#8C8278]/50 bg-[rgba(242,238,230,0.04)]"
                          }`}
                          style={{ height: "1.5rem" }}
                        />
                      </span>
                      <span className="text-[11px] font-medium leading-none">{name}</span>
                    </button>
                  );
                })}
              </div>
              {FORMAT_DIMENSIONS[format] && (
                <p className="text-[11px] text-[#8C8278]">
                  {FORMAT_DIMENSIONS[format].w} × {FORMAT_DIMENSIONS[format].h} px · {FORMAT_DIMENSIONS[format].orientation}
                </p>
              )}
            </div>
            )}

            </fieldset>
            <div className={`shrink-0 border-t border-[rgba(242,238,230,0.06)] ${isComposerModal ? "px-5 py-4 sm:px-10 lg:px-24" : "p-5"}`}>
            <div className={isComposerModal ? "flex flex-row-reverse flex-wrap items-center gap-3" : "space-y-3"}>
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
                className={`mm-cta flex cursor-pointer items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-[#F7F3EC] disabled:cursor-not-allowed disabled:opacity-40 ${isComposerModal ? "min-w-[200px]" : "w-full"}`}
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
                  className={`text-[11px] text-[#8C8278] transition-colors hover:text-[#CFC8BD] ${isComposerModal ? "flex-1 text-left" : "w-full text-center"}`}
                >
                  skip the extra questions →
                </button>
              )}

              {error && (
                <p
                  role="alert"
                  className="w-full rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-300"
                >
                  {error}
                </p>
              )}
            </div>
            </div>
          </form>
  );

  return (
    <div className="mm-ambient relative flex min-h-[100svh] flex-col dt:h-screen dt:overflow-hidden">
      <StudioHeader
        user={user}
        initials={initials}
        onHome={() => createNew(false)}
        onCreate={() => createNew(true)}
        createDisabled={loading}
        onOpenGallery={() => setMobileNavOpen(true)}
        onTour={() => setTourOpen(true)}
      />

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
          className={`fixed inset-y-0 left-0 z-40 flex w-[17rem] shrink-0 flex-col overflow-hidden border-r border-[rgba(242,238,230,0.08)] bg-[#161412] shadow-2xl transition-transform duration-300 ease-in-out dt:relative dt:z-auto dt:translate-x-0 dt:bg-[#1C1A18]/60 dt:shadow-none dt:transition-[width] ${
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
              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md text-[#8C8278] transition-colors hover:bg-[rgba(242,238,230,0.06)] hover:text-[#F2EEE6] dt:hidden"
            >
              <X className="h-4 w-4" />
            </button>
            {/* Desktop: collapse the rail */}
            <button
              onClick={() => setGalleryOpen((o) => !o)}
              aria-label={galleryOpen ? "Collapse gallery" : "Expand gallery"}
              className="hidden h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md text-[#8C8278] transition-colors hover:bg-[rgba(242,238,230,0.06)] hover:text-[#F2EEE6] dt:grid"
            >
              <ChevronLeft
                className={`h-4 w-4 transition-transform duration-300 ${
                  galleryOpen ? "" : "rotate-180"
                }`}
              />
            </button>
          </div>

          {/* Body — fixed width so it clips cleanly instead of reflowing as the rail shrinks */}
          <div
            className={`flex w-[17rem] min-h-0 flex-1 flex-col transition-opacity duration-200 dt:w-56 xl:w-64 ${
              galleryOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
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
              {canFreeform && decks && decks.length > 0 && (
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
                          className="block w-full overflow-hidden rounded-lg border border-[rgba(242,238,230,0.08)] text-left transition-colors hover:border-[rgba(242,238,230,0.25)]"
                        >
                          {/* First slide as the thumbnail (16:9), same treatment as the design tiles */}
                          {d.status === "generating" ? (
                            <div className="grid aspect-[16/9] w-full place-items-center bg-[rgba(242,238,230,0.03)]">
                              <Loader2 className="h-4 w-4 animate-spin text-[#CC7A5C]" />
                            </div>
                          ) : d.thumbnail ? (
                            <GalleryThumb svg={d.thumbnail} format="16:9" />
                          ) : (
                            <div className="grid aspect-[16/9] w-full place-items-center bg-[rgba(242,238,230,0.03)]">
                              <Presentation className="h-5 w-5 text-[#8C8278]/50" />
                            </div>
                          )}
                          <span className="flex items-center gap-1.5 px-2 py-1.5 pr-8">
                            <Presentation className="h-3 w-3 shrink-0 text-[#CC7A5C]" />
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

        {/* ── Left control panel — a compact start panel when idle, a centred
            modal (blurred canvas behind) for every new creation, and the inline
            refine form once a design exists. ── */}
        {isComposerModal ? (
          <ComposerFrame step={composerStep} briefStep={briefStep} onBack={backToTemplates} onClose={closeComposer}>
            {composerStep === "template" ? (
            <div key="step-template" className={`${stepDir === "back" ? "mm-step-back" : "mm-step-in"} min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8`}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-[22px] font-light tracking-tight text-[#F2EEE6]" style={{ fontFamily: "var(--font-display)" }}>Pick a template</h2>
                  <p className="mt-1 text-[13px] text-[#8C8278]">Your design keeps this look. You add the event.</p>
                </div>
                {canFreeform && (
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={pickPresentation} className="mm-ghost"><Presentation className="h-3.5 w-3.5" /> Presentation</button>
                    <button type="button" onClick={pickBlank} className="mm-ghost"><Sparkles className="h-3.5 w-3.5" /> Blank canvas</button>
                    <Link href="/templates" className="mm-ghost">Manage</Link>
                  </div>
                )}
              </div>
              <div className="mt-6" data-tour="templates">
                <TemplatePicker mode="pick" selectedId={templateId} onPick={pickTemplate} />
              </div>
            </div>
            ) : (
              composerForm
            )}
          </ComposerFrame>
        ) : threadId ? (
          <aside className="flex w-full shrink-0 flex-col border-b border-[rgba(242,238,230,0.08)] bg-[#1C1A18]/40 dt:w-72 dt:overflow-hidden dt:border-b-0 dt:border-r xl:w-80">
            {composerForm}
          </aside>
        ) : null}

        {/* ── Canvas: scrollable chat feed of every version ── */}
        <main
          className="relative flex min-h-[60svh] w-full flex-1 flex-col bg-[#18160F] p-4 sm:p-6 dt:min-h-0 dt:overflow-y-auto xl:p-8"
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
            <div className="m-auto flex w-full max-w-3xl flex-col items-center gap-7 py-6 text-center">
              <div className="mm-fade-up space-y-2.5">
                <p
                  className="text-[34px] font-light leading-[1.1] tracking-tight text-[#F2EEE6] sm:text-[42px]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  What are we making today?
                </p>
                <p className="text-[14px] text-[#8C8278]">Pick a template, add your event, and the design lands here.</p>
              </div>
              <button
                type="button"
                onClick={() => createNew(true)}
                disabled={loading}
                className="mm-cta mm-fade-up flex h-11 cursor-pointer items-center gap-2 rounded-full pl-4 pr-5 text-sm font-medium text-[#F7F3EC] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ animationDelay: "70ms" }}
              >
                <Plus className="h-4 w-4" /> Create
              </button>
              <div className="mm-fade-up mt-2 w-full text-left" style={{ animationDelay: "140ms" }}>
                <p className="mm-eyebrow mb-3">Start from a template</p>
                <TemplatePicker
                  mode="pick"
                  limit={8}
                  onPick={(t) => {
                    createNew(true);
                    pickTemplate(t);
                  }}
                />
              </div>
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
    </div>
  );
}
