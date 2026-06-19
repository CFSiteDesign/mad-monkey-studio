"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { sanitizeSvg } from "@/lib/sanitize-svg";
import { inlineSvgImages } from "@/lib/inline-images";
import { BrandLogo } from "@/components/brand-logo";
import { PoweredBy } from "@/components/powered-by";
import { ChevronLeft, Download, Loader2, Presentation } from "lucide-react";

function Slide({ outputCode, index }: { outputCode: string; index: number }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let cancelled = false;
    inlineSvgImages(outputCode).then((s) => {
      if (!cancelled) setSvg(sanitizeSvg(s));
    });
    return () => {
      cancelled = true;
    };
  }, [outputCode]);
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-[rgba(242,238,230,0.1)]">
      <div className="relative aspect-video w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full">
        {svg ? (
          <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[#161412]">
            <Loader2 className="h-5 w-5 animate-spin text-[#8C8278]" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-widest text-[#8C8278]">
        <span>Slide {index + 1}</span>
      </div>
    </div>
  );
}

export default function PresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const deck = useQuery(api.decksInternal.getDeck, { deckId: id as Id<"decks"> });
  const [exporting, setExporting] = useState(false);

  async function exportPptx() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/deck-export/${id}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(deck?.title ?? "presentation").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* surfaced below via a simple alert fallback */
      alert("Couldn't export the PowerPoint — try again once all slides are done.");
    } finally {
      setExporting(false);
    }
  }

  const realSlides = (deck?.slides ?? []).filter((s) => s.outputCode);
  const generating = deck?.status === "generating";
  const done = deck?.status === "complete";

  return (
    <main className="min-h-screen bg-[#1C1A18] text-[#F2EEE6]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[rgba(242,238,230,0.08)] bg-[#1C1A18]/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-[#8C8278] hover:text-[#F2EEE6]">
            <ChevronLeft className="h-4 w-4" /> Studio
          </Link>
          <BrandLogo />
        </div>
        <button
          onClick={exportPptx}
          disabled={exporting || !done || realSlides.length === 0}
          className="mm-cta flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-[#F7F3EC] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export to PowerPoint
        </button>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {deck === undefined ? (
          <div className="grid place-items-center py-32">
            <Loader2 className="h-6 w-6 animate-spin text-[#8C8278]" />
          </div>
        ) : deck === null ? (
          <p className="py-32 text-center text-sm text-[#8C8278]">Presentation not found.</p>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#CC7A5C]/15 text-[#CC7A5C]">
                <Presentation className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-lg font-semibold">{deck.title}</h1>
                <p className="text-[11px] text-[#8C8278]">
                  {generating
                    ? `Designing slides… ${realSlides.length}/${deck.slideCount}`
                    : deck.status === "failed"
                    ? `Failed: ${deck.error ?? "unknown error"}`
                    : `${realSlides.length} slides · $${deck.costUsd.toFixed(2)}`}
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {realSlides.map((s, i) => (
                <Slide key={i} outputCode={s.outputCode} index={i} />
              ))}
              {generating && (
                <div className="grid aspect-video w-full place-items-center rounded-xl border border-dashed border-[rgba(242,238,230,0.12)]">
                  <div className="flex items-center gap-2 text-sm text-[#8C8278]">
                    <Loader2 className="h-4 w-4 animate-spin" /> Designing slide {realSlides.length + 1}…
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <PoweredBy />
    </main>
  );
}
