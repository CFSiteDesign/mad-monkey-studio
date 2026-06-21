"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Crop, Loader2, Search, Upload, X } from "lucide-react";
import { PhotoCropper, type CropRect } from "@/components/photo-cropper";

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

function numAttr(tag: string, name: string): number | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"\\s*(-?[\\d.]+)`));
  return m ? parseFloat(m[1]) : null;
}

export type PhotoBox = { x: number; y: number; w: number; h: number };
export type PhotoTarget = {
  index: number;
  href: string;
  box: PhotoBox | null; // the frame / clip window — enables repositioning
  rx: number; // corner radius of that window
  clipId: string | null; // existing clip-path id to reuse, if any
};
export type Placement = { x: number; y: number; w: number; h: number };

/** A rounded <rect> roughly matching a box → its corner radius (for un-clipped images). */
function frameRxFor(svg: string, box: PhotoBox): number {
  let best = 0;
  for (const r of svg.match(/<rect\b[^>]*>/gi) ?? []) {
    const rx = numAttr(r, "rx");
    if (rx == null || rx <= 0) continue;
    const x = numAttr(r, "x"), y = numAttr(r, "y"), w = numAttr(r, "width"), h = numAttr(r, "height");
    if (x == null || y == null || w == null || h == null) continue;
    if (
      Math.abs(x - box.x) < box.w * 0.12 &&
      Math.abs(y - box.y) < box.h * 0.12 &&
      Math.abs(w - box.w) < box.w * 0.18 &&
      Math.abs(h - box.h) < box.h * 0.18
    ) {
      best = Math.max(best, rx);
    }
  }
  return best;
}

/** The swappable photos = <image> elements that aren't brand logos, with their
 *  frame geometry so they can be repositioned within the frame. */
export function photoTargetsOf(svg: string): PhotoTarget[] {
  const out: PhotoTarget[] = [];
  let i = -1;
  for (const m of svg.matchAll(/<image\b[^>]*>/gi)) {
    const tag = m[0];
    if (/\/mm-logo-/.test(tag)) continue;
    i++;
    const href = tag.match(/(?:xlink:)?href\s*=\s*"([^"]+)"/i)?.[1] ?? "";
    const ix = numAttr(tag, "x"), iy = numAttr(tag, "y"), iw = numAttr(tag, "width"), ih = numAttr(tag, "height");
    const clipId = tag.match(/clip-path\s*=\s*"url\(#([^)]+)\)"/i)?.[1] ?? null;
    let box: PhotoBox | null =
      ix != null && iy != null && iw != null && ih != null ? { x: ix, y: iy, w: iw, h: ih } : null;
    let rx = 0;
    if (clipId) {
      const cp = svg.match(new RegExp(`<clipPath[^>]*\\bid="${clipId}"[^>]*>([\\s\\S]*?)</clipPath>`, "i"));
      const rect = cp?.[1]?.match(/<rect\b[^>]*>/i)?.[0];
      if (rect) {
        const cx = numAttr(rect, "x"), cy = numAttr(rect, "y"), cw = numAttr(rect, "width"), ch = numAttr(rect, "height");
        if (cx != null && cy != null && cw != null && ch != null) box = { x: cx, y: cy, w: cw, h: ch };
        rx = numAttr(rect, "rx") ?? 0;
      }
    } else if (box) {
      rx = frameRxFor(svg, box);
    }
    out.push({ index: i, href, box, rx, clipId });
  }
  return out;
}

/** Replace just the href of the Nth non-logo <image> (no reposition). */
export function swapNthPhoto(svg: string, n: number, newUrl: string): string {
  let i = -1;
  return svg.replace(/<image\b[^>]*>/gi, (tag) => {
    if (/\/mm-logo-/.test(tag)) return tag;
    i++;
    if (i !== n) return tag;
    return tag.replace(/((?:xlink:)?href=")[^"]*(")/i, `$1${newUrl}$2`);
  });
}

/** Swap or reposition the Nth non-logo photo. With a placement the image is
 *  sized/offset to the chosen crop and clipped to the frame (corners stay
 *  rounded, nothing spills); without, it just swaps the href. */
export function placePhoto(svg: string, n: number, newUrl: string, placement: Placement | null): string {
  if (!placement) return swapNthPhoto(svg, n, newUrl);
  const t = photoTargetsOf(svg)[n];
  if (!t || !t.box) return swapNthPhoto(svg, n, newUrl);
  const r = (v: number) => Math.round(v * 10) / 10;
  let clipId = t.clipId;
  let injectClip = "";
  if (!clipId) {
    clipId = `mmcrop-${n}-${Math.round(t.box.x)}-${Math.round(t.box.y)}`;
    injectClip = `<clipPath id="${clipId}"><rect x="${r(t.box.x)}" y="${r(t.box.y)}" width="${r(t.box.w)}" height="${r(t.box.h)}" rx="${r(t.rx)}"/></clipPath>`;
  }
  const newImg = `<image href="${newUrl}" x="${r(placement.x)}" y="${r(placement.y)}" width="${r(placement.w)}" height="${r(placement.h)}" preserveAspectRatio="none" clip-path="url(#${clipId})"/>`;
  let i = -1;
  return svg.replace(/<image\b[^>]*>/gi, (tag) => {
    if (/\/mm-logo-/.test(tag)) return tag;
    i++;
    if (i !== n) return tag;
    return injectClip + newImg;
  });
}

/**
 * Modal to change a photo: pick from the community bank or upload your own
 * (auto-described + added to the bank), then drag/zoom to frame the exact shot.
 */
export function ChangePhoto({
  targets,
  onSwap,
  onClose,
}: {
  targets: PhotoTarget[];
  onSwap: (index: number, newUrl: string, placement: Placement | null) => Promise<void>;
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
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const target = targets.find((t) => t.index === targetIndex) ?? null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function applySwap(url: string, placement: Placement | null) {
    if (targetIndex == null) return;
    setBusy("Updating design…");
    try {
      await onSwap(targetIndex, url, placement);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the design.");
      setBusy("");
    }
  }

  // A chosen image goes to the reposition step if the photo sits in a frame;
  // otherwise it's swapped straight in.
  function chooseImage(url: string) {
    if (target?.box) setCropUrl(url);
    else void applySwap(url, null);
  }

  // A freshly uploaded image lands in the bank reactively — pick it up once it appears.
  useEffect(() => {
    if (!pendingId || !images || targetIndex == null) return;
    const row = images.find((im) => im.id === pendingId);
    if (row?.url) {
      setPendingId(null);
      setBusy("");
      chooseImage(row.url);
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
      setPendingId(newId as unknown as string); // effect picks it up once it appears in the bank
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
  const cropping = cropUrl != null && target?.box != null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0a0a0a]/85 p-6 backdrop-blur-sm">
      <div className="mm-card flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[rgba(242,238,230,0.1)] px-5 py-3.5">
          <p className="text-sm font-medium text-[#F2EEE6]">
            {cropping ? "Frame the shot" : picking ? "Which photo do you want to change?" : "Change photo"}
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

        {cropping ? (
          <div className="overflow-y-auto">
            <PhotoCropper
              imageUrl={cropUrl!}
              frameAspect={target!.box!.w / target!.box!.h}
              rxFrac={target!.rx / Math.min(target!.box!.w, target!.box!.h)}
              onBack={() => setCropUrl(null)}
              onApply={(rect: CropRect) => {
                const b = target!.box!;
                applySwap(cropUrl!, {
                  x: b.x + rect.nx * b.w,
                  y: b.y + rect.ny * b.h,
                  w: rect.nw * b.w,
                  h: rect.nh * b.h,
                });
              }}
            />
          </div>
        ) : picking ? (
          /* Choose which photo (only when the design has several) */
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

            {/* Reframe the photo that's already here — no swap, straight to drag/zoom */}
            {target?.box && (
              <button
                onClick={() => chooseImage(target.href)}
                disabled={!!busy}
                className="flex shrink-0 items-center gap-2.5 border-b border-[rgba(242,238,230,0.08)] px-5 py-2.5 text-left transition-colors hover:bg-[rgba(242,238,230,0.04)] disabled:opacity-50"
              >
                <Crop className="h-4 w-4 shrink-0 text-[#CC7A5C]" />
                <span className="text-xs text-[#CFC8BD]">
                  <span className="font-medium text-[#F2EEE6]">Reframe the current photo</span> — drag &amp; zoom to reposition without changing it
                </span>
              </button>
            )}

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
                    onClick={() => chooseImage(im.url!)}
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
