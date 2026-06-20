"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { sanitizeSvg } from "@/lib/sanitize-svg";
import { inlineSvgImages } from "@/lib/inline-images";
import { BrandLogo } from "@/components/brand-logo";
import { PoweredBy } from "@/components/powered-by";
import { QuickFixEditor } from "@/components/quick-fix-editor";
import { ChangePhoto, photoTargetsOf, swapNthPhoto } from "@/components/change-photo";
import { ChevronLeft, Download, Images, Loader2, Pencil, Presentation } from "lucide-react";

function Slide({
  outputCode,
  index,
  onEdit,
  onChangePhoto,
}: {
  outputCode: string;
  index: number;
  onEdit?: () => void;
  onChangePhoto?: () => void;
}) {
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
    <div className="group overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-[rgba(242,238,230,0.1)]">
      <div className="relative aspect-video w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full">
        {svg ? (
          <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[#161412]">
            <Loader2 className="h-5 w-5 animate-spin text-[#8C8278]" />
          </div>
        )}
        {onEdit && svg && (
          <button
            onClick={onEdit}
            title="Move, resize and retype elements on this slide by hand"
            className="absolute right-3 top-3 flex cursor-pointer items-center gap-1.5 rounded-full bg-[#1C1A18]/85 px-3 py-1.5 text-xs font-medium text-[#F2EEE6] opacity-0 ring-1 ring-[rgba(242,238,230,0.12)] backdrop-blur-sm transition-opacity hover:bg-[#1C1A18] group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
            Quick fix
          </button>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-widest text-[#8C8278]">
        <span>Slide {index + 1}</span>
        <div className="flex items-center gap-3">
          {onChangePhoto && (
            <button
              onClick={onChangePhoto}
              className="flex cursor-pointer items-center gap-1 text-[#8C8278] transition-colors hover:text-[#F2EEE6]"
            >
              <Images className="h-3 w-3" />
              Change photo
            </button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex cursor-pointer items-center gap-1 text-[#8C8278] transition-colors hover:text-[#F2EEE6]"
            >
              <Pencil className="h-3 w-3" />
              Quick fix
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const deck = useQuery(api.decksInternal.getDeck, { deckId: id as Id<"decks"> });
  const saveSlideEdit = useMutation(api.decksInternal.saveSlideEdit);
  const [exporting, setExporting] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);

  async function exportPptx() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/deck-export/${id}`);
      if (!res.ok) {
        let detail = `${res.status}`;
        try {
          detail = (await res.json())?.error ?? detail;
        } catch {
          /* non-JSON error body — keep the status code */
        }
        throw new Error(detail);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(deck?.title ?? "presentation").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      alert(`Couldn't export the PowerPoint.\n\n${msg}\n\nIf this mentions "rasterizeForExport", the backend needs deploying. Otherwise try again once all slides are done.`);
    } finally {
      setExporting(false);
    }
  }

  const realSlides = (deck?.slides ?? [])
    .map((s, i) => ({ ...s, _index: i }))
    .filter((s) => s.outputCode);
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
                <Slide
                  key={s._index}
                  outputCode={s.outputCode}
                  index={i}
                  onEdit={done ? () => setEditingIndex(s._index) : undefined}
                  onChangePhoto={
                    done && photoTargetsOf(s.outputCode).length > 0
                      ? () => setPhotoIndex(s._index)
                      : undefined
                  }
                />
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

      {/* Quick fix — hand-edit one slide; saved in place, re-renders reactively */}
      {editingIndex !== null && deck?.slides[editingIndex] && (
        <QuickFixEditor
          outputCode={deck.slides[editingIndex].outputCode}
          onCancel={() => setEditingIndex(null)}
          onSave={async (edited) => {
            await saveSlideEdit({
              deckId: id as Id<"decks">,
              slideIndex: editingIndex,
              outputCode: edited,
            });
            setEditingIndex(null);
          }}
        />
      )}

      {/* Change photo — swap a slide's photo for a bank image or a new upload */}
      {photoIndex !== null && deck?.slides[photoIndex] && (
        <ChangePhoto
          targets={photoTargetsOf(deck.slides[photoIndex].outputCode)}
          onClose={() => setPhotoIndex(null)}
          onSwap={async (idx, newUrl) => {
            await saveSlideEdit({
              deckId: id as Id<"decks">,
              slideIndex: photoIndex,
              outputCode: swapNthPhoto(deck.slides[photoIndex].outputCode, idx, newUrl),
            });
          }}
        />
      )}
    </main>
  );
}
