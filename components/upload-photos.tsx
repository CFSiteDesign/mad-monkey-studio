"use client";

import { useRef } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Loader2, Upload, X } from "lucide-react";

/** Downscale to ≤1200px JPEG before upload (keeps the Claude vision payload small). */
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

export type UploadedImage = {
  localId: string;
  previewUrl: string;
  status: "uploading" | "ready" | "error";
  description: string;
};

const MAX_IMAGES = 3;

/**
 * Optional "use your own photo" on the creation step. Each upload is downscaled,
 * auto-described by Claude, and added to the community bank — then its
 * description is handed up so the generation is told to feature it.
 */
export function UploadPhotos({
  images,
  onChange,
}: {
  images: UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
}) {
  const getUploadUrl = useMutation(api.imageBank.generateUploadUrl);
  const addImage = useMutation(api.imageBank.addImage);
  const describeImage = useAction(api.imageBankActions.describeImage);
  const fileRef = useRef<HTMLInputElement>(null);

  const imagesRef = useRef(images);
  imagesRef.current = images;
  const patch = (localId: string, p: Partial<UploadedImage>) =>
    onChange(imagesRef.current.map((it) => (it.localId === localId ? { ...it, ...p } : it)));

  async function processFile(file: File, localId: string) {
    try {
      const resized = await resizeImage(file);
      const uploadUrl = await getUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: resized });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const description = await describeImage({ storageId }); // Claude vision caption
      await addImage({ storageId, description }); // → community bank
      patch(localId, { status: "ready", description });
    } catch {
      patch(localId, { status: "error" });
    }
  }

  function onFiles(files: File[]) {
    const room = MAX_IMAGES - imagesRef.current.length;
    const next = files.filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, room));
    const added = next.map((file, i) => ({
      localId: `${file.name}-${file.size}-${i}-${file.lastModified}`,
      previewUrl: URL.createObjectURL(file),
      status: "uploading" as const,
      description: "",
    }));
    onChange([...imagesRef.current, ...added]);
    added.forEach((it, i) => processFile(next[i], it.localId));
  }

  return (
    <div className="space-y-2" data-tour="upload-photo">
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-medium text-[#CFC8BD]">
          Use your own photo? <span className="text-[#8C8278]">· optional</span>
        </label>
        <span className="text-[10px] text-[#8C8278]">{images.length}/{MAX_IMAGES}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {images.map((it) => (
          <div
            key={it.localId}
            className="relative h-20 w-20 overflow-hidden rounded-lg ring-1 ring-[rgba(242,238,230,0.12)] lg:h-16 lg:w-16"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.previewUrl} alt="Your upload" className="h-full w-full object-cover" />
            {it.status !== "ready" && (
              <div className="absolute inset-0 grid place-items-center bg-[#1C1A18]/70">
                {it.status === "uploading" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#CC7A5C]" />
                ) : (
                  <span className="text-[9px] text-red-300">failed</span>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => onChange(images.filter((x) => x.localId !== it.localId))}
              className="absolute right-0.5 top-0.5 grid h-6 w-6 cursor-pointer place-items-center rounded-full bg-[#1C1A18]/85 text-[#F2EEE6] hover:bg-[#1C1A18] lg:h-4 lg:w-4"
              aria-label="Remove photo"
            >
              <X className="h-3 w-3 lg:h-2.5 lg:w-2.5" />
            </button>
          </div>
        ))}

        {images.length < MAX_IMAGES && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[rgba(242,238,230,0.2)] text-[#8C8278] transition-colors hover:border-[#CC7A5C]/60 hover:text-[#CFC8BD] lg:h-16 lg:w-16"
            title="Upload up to 3 of your own photos"
          >
            <Upload className="h-4 w-4" />
            <span className="text-[9px]">Upload</span>
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <p className="text-[10px] leading-relaxed text-[#8C8278]">
        Your photo is added to the community bank (auto-described) and featured in the design.
      </p>
    </div>
  );
}
