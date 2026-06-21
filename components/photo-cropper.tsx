"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, ZoomIn } from "lucide-react";

/** Result as a rect relative to the cut-out window ([0,0,1,1] = the window
 *  exactly). The photo always covers the window, so nx≤0, ny≤0, nx+nw≥1,
 *  ny+nh≥1. */
export type CropRect = { nx: number; ny: number; nw: number; nh: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Reframe a photo without cropping it away. The WHOLE photo is shown (dimmed
 * outside a fixed cut-out window); you drag the full photo behind the window
 * and zoom to land the exact shot. The window always stays filled. Returns the
 * chosen rect relative to the window.
 */
export function PhotoCropper({
  imageUrl,
  frameAspect,
  rxFrac = 0,
  clipShape = null,
  clipBox = null,
  onApply,
  onBack,
}: {
  imageUrl: string;
  frameAspect: number; // windowW / windowH
  rxFrac?: number; // corner radius as a fraction of the window's short side
  clipShape?: string | null; // actual frame clip shape markup (circle/path/…)
  clipBox?: { x: number; y: number; w: number; h: number } | null; // that shape's bounding box
  onApply: (rect: CropRect) => void;
  onBack: () => void;
}) {
  // The editing area adapts to the space available so it never overflows a phone.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(() =>
    typeof window === "undefined"
      ? { w: 460, h: 360 }
      : { w: Math.min(460, window.innerWidth - 56), h: Math.min(360, window.innerHeight - 230) },
  );
  useEffect(() => {
    function measure() {
      const cw = wrapRef.current?.clientWidth;
      const w = cw ? cw - 40 : window.innerWidth - 56; // outer padding (p-5) = 40px
      setAvail({
        w: Math.max(220, Math.min(460, w)),
        h: Math.max(240, Math.min(360, window.innerHeight - 230)),
      });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Stage = the editing canvas; the cut-out window sits centred inside it with a
  // margin all round so you can see (dimmed) and drag the rest of the photo.
  const geo = useMemo(() => {
    const maxWW = Math.max(120, avail.w * 0.7);
    const maxWH = Math.max(140, avail.h * 0.8);
    let WW = maxWW;
    let WH = WW / Math.max(0.2, frameAspect);
    if (WH > maxWH) {
      WH = maxWH;
      WW = WH * frameAspect;
    }
    WW = Math.round(WW);
    WH = Math.round(WH);
    const marginX = Math.round(Math.min(WW * 0.5, Math.max(28, (avail.w - WW) / 2)));
    const marginY = Math.round(Math.min(WH * 0.34, Math.max(20, (avail.h - WH) / 2)));
    const SW = Math.round(Math.min(avail.w, WW + marginX * 2));
    const SH = Math.round(Math.min(avail.h, WH + marginY * 2));
    return { SW, SH, WW, WH, WX: Math.round((SW - WW) / 2), WY: Math.round((SH - WH) / 2) };
  }, [avail, frameAspect]);

  const [imgAspect, setImgAspect] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState<{ pl: number; pt: number } | null>(null);
  const drag = useRef<{ x: number; y: number; pl: number; pt: number } | null>(null);

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

  // Photo size: zoom 1 = "covers the window" (so the window is never empty),
  // then scaled up by zoom for a tighter crop.
  const a = imgAspect ?? frameAspect;
  const baseW = a > frameAspect ? geo.WH * a : geo.WW;
  const baseH = a > frameAspect ? geo.WH : geo.WW / a;
  const rw = baseW * zoom;
  const rh = baseH * zoom;

  // Keep the photo covering the window (drag never exposes a gap).
  const clampPos = (pl: number, pt: number) => ({
    pl: clamp(pl, geo.WX + geo.WW - rw, geo.WX),
    pt: clamp(pt, geo.WY + geo.WH - rh, geo.WY),
  });
  const centred = () =>
    clampPos(geo.WX + (geo.WW - rw) / 2, geo.WY + (geo.WH - rh) / 2);

  // Centre the photo on the window once it loads.
  useEffect(() => {
    if (imgAspect != null) setPos(centred());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgAspect]);

  // Re-clamp if the stage resizes (e.g. rotate the phone).
  useEffect(() => {
    setPos((p) => (p ? clampPos(p.pl, p.pt) : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.SW, geo.SH]);

  const p = pos ?? centred();

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, pl: p.pl, pt: p.pt };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setPos(
      clampPos(
        drag.current.pl + (e.clientX - drag.current.x),
        drag.current.pt + (e.clientY - drag.current.y),
      ),
    );
  }
  function onPointerUp() {
    drag.current = null;
  }

  function onZoom(v: number) {
    // Zoom around the window centre so the framed subject stays put.
    const ccx = geo.WX + geo.WW / 2;
    const ccy = geo.WY + geo.WH / 2;
    const nx = (ccx - p.pl) / rw;
    const ny = (ccy - p.pt) / rh;
    const nrw = baseW * v;
    const nrh = baseH * v;
    setZoom(v);
    setPos({
      pl: clamp(ccx - nx * nrw, geo.WX + geo.WW - nrw, geo.WX),
      pt: clamp(ccy - ny * nrh, geo.WY + geo.WH - nrh, geo.WY),
    });
  }

  function apply() {
    onApply({
      nx: (p.pl - geo.WX) / geo.WW,
      ny: (p.pt - geo.WY) / geo.WH,
      nw: rw / geo.WW,
      nh: rh / geo.WH,
    });
  }

  const radius = rxFrac * Math.min(geo.WW, geo.WH);

  // The cut-out hole matches the design's ACTUAL frame shape (circle, arch,
  // rounded rect…), not just a rectangle. We scale the real clip geometry into
  // the window rect; if there's no shape we fall back to a rounded rect.
  const rawId = useId();
  const maskId = "mmhole-" + rawId.replace(/[^a-zA-Z0-9]/g, "");
  const shapeWith = (shape: string, extra: string) =>
    shape
      .replace(/\s(fill|stroke|stroke-width|vector-effect|opacity|style|clip-path|mask)\s*=\s*"[^"]*"/gi, "")
      .replace(/^(<[a-zA-Z]+)/, `$1 ${extra} `);
  const hole = (extra: string) => {
    if (clipShape && clipBox && clipBox.w > 0 && clipBox.h > 0) {
      const s = geo.WW / clipBox.w;
      const tf = `translate(${geo.WX} ${geo.WY}) scale(${s}) translate(${-clipBox.x} ${-clipBox.y})`;
      return `<g transform="${tf}">${shapeWith(clipShape, extra)}</g>`;
    }
    return `<rect x="${geo.WX}" y="${geo.WY}" width="${geo.WW}" height="${geo.WH}" rx="${radius}" ${extra}/>`;
  };
  const overlaySvg =
    `<defs><mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${geo.SW}" height="${geo.SH}">` +
    `<rect width="${geo.SW}" height="${geo.SH}" fill="#fff"/>` +
    hole('fill="#000"') +
    `</mask></defs>` +
    `<rect width="${geo.SW}" height="${geo.SH}" fill="rgba(12,11,9,0.62)" mask="url(#${maskId})"/>` +
    hole('fill="none" stroke="#F2EEE6" stroke-width="2" vector-effect="non-scaling-stroke"');

  return (
    <div ref={wrapRef} className="flex flex-col items-center gap-4 p-5">
      <p className="px-2 text-center text-[12px] text-[#8C8278]">
        Drag the photo to frame the shot · zoom for a tighter crop
      </p>

      <div
        className="relative touch-none select-none overflow-hidden rounded-xl bg-[#100F0D]"
        style={{ width: geo.SW, height: geo.SH }}
      >
        {imgAspect == null ? (
          <div className="grid h-full w-full place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#CC7A5C]" />
          </div>
        ) : (
          <>
            {/* The full photo — draggable behind the window */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Reposition"
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ left: p.pl, top: p.pt, width: rw, height: rh }}
            />
            {/* Drag surface (whole stage) */}
            <div
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            {/* Cut-out window in the frame's real shape: dims outside, bright outline on top */}
            <svg
              className="pointer-events-none absolute inset-0"
              width={geo.SW}
              height={geo.SH}
              aria-hidden
              dangerouslySetInnerHTML={{ __html: overlaySvg }}
            />
            <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/45 px-2 py-1 text-[11px] text-[#F2EEE6]">
              The bright window is your post
            </div>
          </>
        )}
      </div>

      <div className="flex w-full max-w-[460px] items-center gap-3">
        <ZoomIn className="h-4 w-4 shrink-0 text-[#8C8278]" />
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => onZoom(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-[#CC7A5C]"
          aria-label="Zoom the photo"
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
          <Check className="h-3.5 w-3.5" /> Use this framing
        </button>
      </div>
    </div>
  );
}
