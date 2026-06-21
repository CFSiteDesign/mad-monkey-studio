"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, ZoomIn } from "lucide-react";

/** Result as a rect relative to the frame ([0,0,1,1] = the frame exactly).
 *  The image always covers the frame, so nx≤0, ny≤0, nx+nw≥1, ny+nh≥1. */
export type CropRect = { nx: number; ny: number; nw: number; nh: number };

const VP_W = 460;

/**
 * Drag-to-pan + zoom cropper. The viewport matches the frame's aspect ratio, so
 * what you see is exactly what will show; the image is constrained to always
 * cover the frame (no gaps). Returns the chosen rect relative to the frame.
 */
export function PhotoCropper({
  imageUrl,
  frameAspect,
  rxFrac = 0,
  onApply,
  onBack,
}: {
  imageUrl: string;
  frameAspect: number; // frameW / frameH
  rxFrac?: number; // corner radius as a fraction of the frame's short side
  onApply: (rect: CropRect) => void;
  onBack: () => void;
}) {
  let vpW = VP_W;
  let vpH = VP_W / Math.max(0.2, frameAspect);
  if (vpH > 380) {
    vpH = 380;
    vpW = vpH * frameAspect;
  }
  vpW = Math.round(vpW);
  vpH = Math.round(vpH);
  const [imgAspect, setImgAspect] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImgAspect(img.naturalWidth / img.naturalHeight || 1);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // Cover size at zoom 1, then scaled by zoom.
  const { rw, rh } = useMemo(() => {
    const a = imgAspect ?? frameAspect;
    const baseW = a > frameAspect ? vpH * a : vpW;
    const baseH = a > frameAspect ? vpH : vpW / a;
    return { rw: baseW * zoom, rh: baseH * zoom };
  }, [imgAspect, frameAspect, zoom, vpW, vpH]);

  const clamp = (p: { x: number; y: number }) => {
    const mx = Math.max(0, (rw - vpW) / 2);
    const my = Math.max(0, (rh - vpH) / 2);
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
  };

  useEffect(() => {
    setPan((p) => clamp(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rw, rh]);

  const imageX = (vpW - rw) / 2 + pan.x;
  const imageY = (vpH - rh) / 2 + pan.y;

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setPan(clamp({ x: drag.current.px + (e.clientX - drag.current.sx), y: drag.current.py + (e.clientY - drag.current.sy) }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  function apply() {
    onApply({ nx: imageX / vpW, ny: imageY / vpH, nw: rw / vpW, nh: rh / vpH });
  }

  return (
    <div className="flex flex-col items-center gap-4 p-5">
      <p className="text-[12px] text-[#8C8278]">Drag to move · zoom to frame the exact shot</p>

      <div
        className="relative cursor-grab touch-none select-none overflow-hidden bg-[#0a0a0a] active:cursor-grabbing"
        style={{ width: vpW, height: vpH, borderRadius: rxFrac * Math.min(vpW, vpH) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {imgAspect == null ? (
          <div className="grid h-full w-full place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#CC7A5C]" />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Reposition"
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ left: imageX, top: imageY, width: rw, height: rh }}
          />
        )}
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/20" style={{ borderRadius: rxFrac * Math.min(vpW, vpH) }} />
      </div>

      <div className="flex w-full max-w-[460px] items-center gap-3">
        <ZoomIn className="h-4 w-4 shrink-0 text-[#8C8278]" />
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-[#CC7A5C]"
        />
      </div>

      <div className="flex w-full max-w-[460px] items-center justify-between">
        <button
          onClick={onBack}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-[#CFC8BD] transition-colors hover:bg-[rgba(242,238,230,0.06)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Pick another
        </button>
        <button
          onClick={apply}
          disabled={imgAspect == null}
          className="mm-cta flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-[#F7F3EC] disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> Use this crop
        </button>
      </div>
    </div>
  );
}
