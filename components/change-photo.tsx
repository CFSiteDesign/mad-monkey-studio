"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Loader2, Search, Upload, X } from "lucide-react";

/** Downscale to ≤1200px JPEG before upload (matches the image-bank page so the
 *  Claude vision payload stays small). */
function resizeImage(file: File, maxPx = 1200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Resize failed"))), "image/jpeg", 0.8);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read that image."));
    };
    img.src = objectUrl;
  });
}

export type PhotoTarget = { index: number; href: string };

/** The swappable photos in a design = <image> elements that aren't brand logos. */
export function photoTargetsOf(svg: string): PhotoTarget[] {
  const out: PhotoTarget[] = [];
  let i = -1;
  for (const m of svg.matchAll(/<image\b[^>]*>/gi)) {
    const tag = m[0];
    if (/\/mm-logo-/.test(tag)) continue;
    i++;
    const href = tag.match(/(?:xlink:)?href="([^"]+)"/i)?.[1] ?? "";
    out.push({ index: i, href });
  }
  return out;
}

/** Replace the href of the Nth non-logo <image> (same ordering as photoTargetsOf). */
export function swapNthPhoto(svg: string, n: number, newUrl: string): string {
  let i = -1;
  return svg.replace(/<image\b[^>]*>/gi, (tag) => {
    if (/\/mm-logo-/.test(tag)) return tag;
    i++;
    if (i !== n) return tag;
    return tag.replace(/((?:xlink:)?href=")[^"]*(")/i, `$1${newUrl}$2`);
  });
}

/**
 * Modal to change a photo in a design: pick from the community image bank, or
 * upload your own (which is auto-described by Claude and added to the bank).
 * onSwap replaces the chosen photo with the new image's URL.
 */
export function ChangePhoto({
  targets,
  onSwap,
  onClose,
}: {
  targets: PhotoTarget[];
  onSwap: (index: number, newUrl: string) => Promise<void>;
  onClose: () => void;
}) {
  const images = useQuery(api.imageBank.listImages);
  const getUploadUrl = useMutation(api.imageBank.generateUploadUrl);
  const addImage = useMutation(api.imageBank.addImage);
  const describeImage = useAction(api.imageBankActions.describeImage);

  const [targetIndex, setTargetIndex] = useState<number | null>(
    targets.length === 1 ? targets[0].index : null,
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function doSwap(url: string) {
    if (targetIndex == null) return;
    setBusy("Updating design…");
    try {
      await onSwap(targetIndex, url);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the design.");
      setBusy("");
    }
  }

  // A freshly uploaded image lands in the bank reactively — swap to it once it appears.
  useEffect(() => {
    if (!pendingId || !images || targetIndex == null) return;
    const row = images.find((im) => im.id === pendingId);
    if (row?.url) {
      setPendingId(null);
      void doSwap(row.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, pendingId, targetIndex]);

  async function handleFile(file: File) {
    if (targetIndex == null) {
      setError("Pick which photo to change first.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("That's not an image file.");
      return;
    }
    setError("");
    setBusy("Uploading…");
    try {
      const resized = await resizeImage(file);
      const uploadUrl = await getUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: resized,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setBusy("Describing for the bank…");
      const description = await describeImage({ storageId });
      setBusy("Adding to the community bank…");
      const newId = await addImage({ storageId, description });
      setBusy("Adding to your design…");
      setPendingId(newId as unknown as string); // effect swaps once it appears in the bank
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setBusy("");
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (images ?? []).filter((im) => im.url && (!q || im.description.toLowerCase().includes(q)));
  }, [images, query]);

  const picking = targetIndex == null && targets.length > 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0a0a0a]/85 p-6 backdrop-blur-sm">
      <div className="mm-card flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[rgba(242,238,230,0.1)] px-5 py-3.5">
          <p className="text-sm font-medium text-[#F2EEE6]">
            {picking ? "Which photo do you want to change?" : "Change photo"}
          </p>
          <button
            onClick={onClose}
            disabled={!!busy}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[#CFC8BD] transition-colors hover:bg-[rgba(242,238,230,0.06)] disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p className="shrink-0 border-b border-red-500/20 bg-red-500/5 px-5 py-2 text-xs text-red-300">{error}</p>
        )}

        {/* Step 1 — choose which photo (only when the design has several) */}
        {picking ? (
          <div className="grid grid-cols-3 gap-3 overflow-y-auto p-5 sm:grid-cols-4">
            {targets.map((t) => (
              <button
                key={t.index}
                onClick={() => setTargetIndex(t.index)}
                className="group relative aspect-square overflow-hidden rounded-lg ring-1 ring-[rgba(242,238,230,0.12)] transition hover:ring-[#CC7A5C]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.href} alt="Photo in the design" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* Search + upload */}
            <div className="flex shrink-0 items-center gap-2 border-b border-[rgba(242,238,230,0.08)] px-5 py-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8C8278]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search the image bank…"
                  className="mm-field w-full rounded-lg pl-9 pr-3 py-2 text-sm text-[#F2EEE6] placeholder:text-[#8C8278]/55"
                />
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={!!busy}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#CC7A5C] px-3.5 py-2 text-xs font-medium text-[#1C1A18] transition-opacity hover:opacity-90 disabled:opacity-50"
                title="Upload a new photo — it's auto-added to the community bank"
              >
                <Upload className="h-3.5 w-3.5" /> Upload new
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Bank grid */}
            <div className="relative grid grid-cols-3 gap-3 overflow-y-auto p-5 sm:grid-cols-4">
              {images === undefined ? (
                <div className="col-span-full grid place-items-center py-10 text-sm text-[#8C8278]">
                  <Loader2 className="h-5 w-5 animate-spin text-[#CC7A5C]" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="col-span-full py-10 text-center text-sm text-[#8C8278]">
                  {query ? "No images match that search." : "The bank is empty — upload one to get started."}
                </p>
              ) : (
                filtered.map((im) => (
                  <button
                    key={im.id}
                    onClick={() => doSwap(im.url!)}
                    disabled={!!busy}
                    title={im.description}
                    className="group relative aspect-square overflow-hidden rounded-lg ring-1 ring-[rgba(242,238,230,0.12)] transition hover:ring-[#CC7A5C] disabled:opacity-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.url!} alt={im.description} className="h-full w-full object-cover" />
                  </button>
                ))
              )}

              {busy && (
                <div className="absolute inset-0 z-10 grid place-items-center bg-[#1C1A18]/80 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-sm text-[#F2EEE6]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#CC7A5C]" /> {busy}
                  </div>
                </div>
              )}
            </div>

            <p className="shrink-0 border-t border-[rgba(242,238,230,0.08)] px-5 py-2.5 text-[11px] text-[#8C8278]">
              Uploads are auto-described by Claude and added to the community bank for everyone.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
