"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BrandLogo } from "@/components/brand-logo";
import { PoweredBy } from "@/components/powered-by";
import {
  ArrowLeft,
  Check,
  Images,
  Loader2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

// ── Queue item state machine ──────────────────────────────────────────────────
type ItemStatus = "uploading" | "describing" | "ready" | "approved" | "rejected" | "error";

type QueueItem = {
  localId: string;
  file: File;
  previewUrl: string;
  storageId: Id<"_storage"> | null;
  description: string;
  status: ItemStatus;
  errorMsg?: string;
};

let _id = 0;
const uid = () => String(++_id);

/** Resize an image to max 1200px on the longest side at 78% JPEG quality.
 *  Keeps the base64 payload well under Claude's 10MB API limit. */
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
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Resize failed"))),
        "image/jpeg",
        0.78,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Load failed")); };
    img.src = objectUrl;
  });
}

export default function ImageBankPage() {
  const images      = useQuery(api.imageBank.listImages);
  const getUploadUrl = useMutation(api.imageBank.generateUploadUrl);
  const addImage    = useMutation(api.imageBank.addImage);
  const deleteUpload = useMutation(api.imageBank.deleteUpload);
  const deleteImage = useMutation(api.imageBank.deleteImage);
  const describeImage = useAction(api.imageBankActions.describeImage);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function patchItem(localId: string, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((i) => (i.localId === localId ? { ...i, ...patch } : i)));
  }

  // ── Core pipeline: upload → describe ─────────────────────────────────────
  async function processFile(item: QueueItem) {
    try {
      // 1. Resize to max 1200px before upload (keeps Claude payload small)
      const resized = await resizeImage(item.file);
      const uploadUrl = await getUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: resized,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json() as { storageId: Id<"_storage"> };
      patchItem(item.localId, { storageId, status: "describing" });

      // 2. Claude vision → description
      const description = await describeImage({ storageId });
      patchItem(item.localId, { description, status: "ready" });
    } catch (err) {
      patchItem(item.localId, {
        status: "error",
        errorMsg: err instanceof Error ? err.message : "Failed",
      });
    }
  }

  function enqueue(files: File[]) {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) return;

    const newItems: QueueItem[] = imageFiles.map((file) => ({
      localId: uid(),
      file,
      previewUrl: URL.createObjectURL(file),
      storageId: null,
      description: "",
      status: "uploading",
    }));

    setQueue((q) => [...q, ...newItems]);
    newItems.forEach(processFile);
  }

  // ── Drag-and-drop handlers ────────────────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    enqueue(Array.from(e.dataTransfer.files));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Approve / reject ──────────────────────────────────────────────────────
  async function approve(item: QueueItem) {
    if (!item.storageId || item.description.trim().length < 10) return;
    try {
      await addImage({ storageId: item.storageId, description: item.description.trim() });
      patchItem(item.localId, { status: "approved" });
    } catch (err) {
      patchItem(item.localId, {
        status: "error",
        errorMsg: err instanceof Error ? err.message : "Failed to save",
      });
    }
  }

  async function reject(item: QueueItem) {
    if (item.storageId) {
      try { await deleteUpload({ storageId: item.storageId }); } catch { /* best-effort */ }
    }
    URL.revokeObjectURL(item.previewUrl);
    setQueue((q) => q.filter((i) => i.localId !== item.localId));
  }

  async function approveAll() {
    const ready = queue.filter((i) => i.status === "ready" && i.description.trim().length >= 10);
    await Promise.all(ready.map(approve));
  }

  const readyCount  = queue.filter((i) => i.status === "ready").length;
  const pendingCount = queue.filter((i) => i.status === "uploading" || i.status === "describing").length;

  return (
    <div className="mm-ambient mm-grain relative min-h-screen overflow-y-auto">
      {/* ── Header ── */}
      <header className="z-20 flex items-center justify-between gap-2 border-b border-[rgba(242,238,230,0.08)] bg-[#1C1A18]/70 px-4 py-3.5 backdrop-blur-md lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo className="h-8 w-auto" />
          <span className="hidden h-6 w-px bg-[rgba(242,238,230,0.12)] sm:block" />
          <p className="truncate text-lg font-light leading-none text-[#F2EEE6]" style={{ fontFamily: "var(--font-display)" }}>
            Image Bank
          </p>
        </div>
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-2 text-sm text-[#8C8278] transition-colors hover:text-[#F2EEE6] lg:px-3">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to Studio</span>
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl space-y-8 px-4 py-6 lg:px-6 lg:py-10">
        {/* ── Intro ── */}
        <div className="mm-fade-up max-w-2xl">
          <h1 className="text-2xl font-light text-[#F2EEE6]" style={{ fontFamily: "var(--font-display)" }}>
            Community image bank
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#8C8278]">
            Drop your shots below — they get described automatically.
            Scan, tweak if needed, approve. Every image goes straight into
            the mix for every asset you generate.
          </p>
        </div>

        {/* ── Drop zone ── */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mm-fade-up flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors lg:px-8 lg:py-12 ${
            dragging
              ? "border-[#CC7A5C] bg-[#CC7A5C]/5"
              : "border-[rgba(242,238,230,0.12)] hover:border-[rgba(242,238,230,0.25)]"
          }`}
        >
          <UploadCloud className={`h-8 w-8 transition-colors ${dragging ? "text-[#CC7A5C]" : "text-[#8C8278]"}`} />
          <div>
            <p className="text-sm font-medium text-[#F2EEE6]">
              Drop images here or click to browse
            </p>
            <p className="mt-1 text-xs text-[#8C8278]">
              Multiple files at once — descriptions written automatically
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => enqueue(Array.from(e.target.files ?? []))}
          />
        </div>

        {/* ── Review queue ── */}
        {queue.length > 0 && (
          <section className="mm-fade-up space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-[#F2EEE6]">
                Review queue
                {pendingCount > 0 && (
                  <span className="ml-2 text-xs text-[#8C8278]">
                    ({pendingCount} describing…)
                  </span>
                )}
              </h2>
              {readyCount > 1 && (
                <button
                  onClick={approveAll}
                  className="mm-cta flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium text-[#F7F3EC]"
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve all ({readyCount})
                </button>
              )}
            </div>

            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {queue.map((item) => (
                <li key={item.localId} className="mm-card flex gap-3 rounded-xl p-3 lg:gap-4 lg:p-4">
                  {/* Thumbnail */}
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg lg:h-24 lg:w-24">
                    <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                    {/* Status overlay */}
                    {(item.status === "uploading" || item.status === "describing") && (
                      <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/60">
                        <Loader2 className="h-5 w-5 animate-spin text-[#CC7A5C]" />
                      </div>
                    )}
                    {item.status === "approved" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/60">
                        <Check className="h-6 w-6 text-[#03ff01]" />
                      </div>
                    )}
                  </div>

                  {/* Description + actions */}
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {item.status === "approved" ? (
                      <p className="text-xs text-[#8C8278] line-clamp-3">{item.description}</p>
                    ) : item.status === "error" ? (
                      <p className="text-xs text-red-300">{item.errorMsg ?? "Something went wrong"}</p>
                    ) : (
                      <textarea
                        value={item.description}
                        onChange={(e) => patchItem(item.localId, { description: e.target.value })}
                        disabled={item.status !== "ready"}
                        rows={3}
                        placeholder={item.status === "describing" ? "reading the shot…" : ""}
                        className="mm-field w-full resize-none rounded-lg px-3 py-2 text-xs text-[#F2EEE6] placeholder:text-[#8C8278]/60 disabled:opacity-50"
                      />
                    )}

                    {(item.status === "ready" || item.status === "error") && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => approve(item)}
                          disabled={item.description.trim().length < 10}
                          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#CC7A5C]/20 px-3 py-1.5 text-xs font-medium text-[#CC7A5C] transition-colors hover:bg-[#CC7A5C]/30 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Check className="h-3 w-3" />
                          Approve
                        </button>
                        <button
                          onClick={() => reject(item)}
                          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[#8C8278] transition-colors hover:bg-[rgba(242,238,230,0.05)] hover:text-[#F2EEE6]"
                        >
                          <X className="h-3 w-3" />
                          Reject
                        </button>
                      </div>
                    )}

                    {item.status === "approved" && (
                      <p className="text-[10px] uppercase tracking-widest text-[#03ff01]">
                        Added to bank
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Live gallery ── */}
        <section className="mm-fade-up">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-[#F2EEE6]">In the bank</h2>
            {images && images.length > 0 && (
              <p className="text-xs text-[#8C8278]">
                {images.length} image{images.length === 1 ? "" : "s"}
              </p>
            )}
          </div>

          {images === undefined ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-[#8C8278]">
              <Loader2 className="h-4 w-4 animate-spin text-[#CC7A5C]" />
              Loading…
            </div>
          ) : images.length === 0 ? (
            <p className="mt-6 text-sm text-[#8C8278]">
              Empty — approve your first image above and it&apos;ll appear here instantly.
            </p>
          ) : (
            <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((img) => (
                <li key={img.id} className="mm-card group relative overflow-hidden rounded-xl">
                  {img.url && (
                    <img src={img.url} alt={img.description} className="aspect-square w-full object-cover" />
                  )}
                  <div className="p-3">
                    <p className="line-clamp-2 text-xs leading-relaxed text-[#CFC8BD]">
                      {img.description}
                    </p>
                    <p className="mt-1.5 flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#8C8278]/70">
                      <Images className="h-3 w-3" />
                      {img.uploaderName}
                    </p>
                  </div>
                  {img.canDelete && (
                    <button
                      onClick={() => deleteImage({ imageId: img.id })}
                      aria-label="Delete image"
                      className="absolute right-2 top-2 grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-[#1C1A18]/80 text-[#8C8278] opacity-100 backdrop-blur transition-opacity hover:text-red-300 lg:h-7 lg:w-7 lg:opacity-0 lg:group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <div className="pointer-events-none fixed bottom-4 right-5 z-20 opacity-60">
        <PoweredBy />
      </div>
    </div>
  );
}
