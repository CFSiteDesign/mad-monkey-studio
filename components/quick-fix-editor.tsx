"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, MousePointerClick, Undo2, X } from "lucide-react";

/**
 * Quick Fix — lightweight hand-editing directly on the generated SVG.
 *
 * Click an element to select · drag to move · corner handle to resize ·
 * rotate handle to spin · double-click text to retype · arrows to nudge ·
 * Delete to remove · ⌘Z to undo. Saving hands the SVG string back to the
 * parent, which persists it as a new version in the chat.
 *
 * Implementation notes:
 * - Only DIRECT children of the root <svg> are selectable, so the parent
 *   coordinate system is always the root viewBox — gestures prepend a
 *   transform in root user units and compose correctly with whatever
 *   translate/rotate/scale the element already carries.
 * - Bank photos are inlined to data URLs for display (browsers block
 *   external loads in some contexts); original hrefs are remembered in
 *   data-orig-href and restored on save so the stored SVG stays small.
 * - Undo = full-document snapshots (cheap at SVG sizes).
 */

type Props = {
  outputCode: string;
  onCancel: () => void;
  onSave: (svg: string) => Promise<void>;
};

type Corners = { x: number; y: number }[];
type FrameBox = { x: number; y: number; w: number; h: number };
type Gesture =
  | { kind: "move"; el: SVGGraphicsElement; base: string; startX: number; startY: number }
  | { kind: "resize"; el: SVGGraphicsElement; base: string; cx: number; cy: number; startDist: number }
  | { kind: "rotate"; el: SVGGraphicsElement; base: string; cx: number; cy: number; startAngle: number }
  // Canva-style: pan/zoom a framed photo *inside* its frame (cover-clamped).
  | { kind: "panImage"; el: SVGGraphicsElement; frame: FrameBox; nat: number; w: number; h: number; baseX: number; baseY: number; startX: number; startY: number }
  | { kind: "pinchImage"; el: SVGGraphicsElement; frame: FrameBox; nat: number; baseZ: number; startDist: number };

const BG_COVERAGE = 0.88; // elements covering ≥88% of both axes = background, not selectable

const getNum = (el: Element, name: string): number | null => {
  const v = el.getAttribute(name);
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** The clip-frame (window) bounding box of a clipped <image>, in root user units. */
function frameBoxOf(root: SVGSVGElement, imgEl: Element): FrameBox | null {
  const id = imgEl.getAttribute("clip-path")?.match(/url\(#([^)]+)\)/)?.[1];
  if (!id) return null;
  let clip: Element | null = null;
  try {
    clip = root.querySelector(`clipPath[id="${CSS.escape(id)}"]`);
  } catch {
    clip = null;
  }
  // Only userSpaceOnUse clips have absolute coords we can pan against;
  // objectBoundingBox clips use 0–1 fractions, so skip them (fall back to move).
  if ((clip?.getAttribute("clipPathUnits") || "").includes("objectBoundingBox")) return null;
  const shape = clip?.querySelector("rect,circle,ellipse,path,polygon") ?? null;
  if (!shape) return null;
  const t = shape.tagName.toLowerCase();
  if (t === "rect") {
    const x = getNum(shape, "x") ?? 0, y = getNum(shape, "y") ?? 0;
    const w = getNum(shape, "width"), h = getNum(shape, "height");
    if (w && h) return { x, y, w, h };
  } else if (t === "circle") {
    const cx = getNum(shape, "cx") ?? 0, cy = getNum(shape, "cy") ?? 0, r = getNum(shape, "r");
    if (r) return { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
  } else if (t === "ellipse") {
    const cx = getNum(shape, "cx") ?? 0, cy = getNum(shape, "cy") ?? 0;
    const rx = getNum(shape, "rx"), ry = getNum(shape, "ry");
    if (rx && ry) return { x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry };
  }
  try {
    const b = (shape as SVGGraphicsElement).getBBox();
    if (b.width && b.height) return { x: b.x, y: b.y, w: b.width, h: b.height };
  } catch {
    /* getBBox can throw inside <defs> */
  }
  return null;
}

/** Photo size that exactly covers the frame at zoom 1, scaled by z. */
function coverSize(frame: FrameBox, natAspect: number, z: number) {
  const fa = frame.w / frame.h;
  return {
    w: (natAspect > fa ? frame.h * natAspect : frame.w) * z,
    h: (natAspect > fa ? frame.h : frame.w / natAspect) * z,
  };
}

/** Keep the photo covering the frame (drag never exposes a gap). */
function clampCover(frame: FrameBox, x: number, y: number, w: number, h: number) {
  return {
    x: Math.min(frame.x, Math.max(frame.x + frame.w - w, x)),
    y: Math.min(frame.y, Math.max(frame.y + frame.h - h, y)),
  };
}

/**
 * Element corners in pixels relative to the wrapper's top-left, via
 * getScreenCTM (well-defined screen mapping). getCTM is avoided because it
 * returns viewport-scaled (not viewBox) coordinates, which mis-aligned the
 * overlay for transformed elements. The overlay is drawn in this same pixel
 * space so the box sits exactly on the element, rotation and all.
 */
function cornersOf(el: SVGGraphicsElement, wrapEl: HTMLElement | null): Corners | null {
  try {
    const b = el.getBBox();
    const m = el.getScreenCTM();
    if (!m || !wrapEl || (b.width === 0 && b.height === 0)) return null;
    const r = wrapEl.getBoundingClientRect();
    return [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x + b.width, b.y + b.height],
      [b.x, b.y + b.height],
    ].map(([x, y]) => ({
      x: m.a * x + m.c * y + m.e - r.left,
      y: m.b * x + m.d * y + m.f - r.top,
    }));
  } catch {
    return null;
  }
}

const aabb = (c: Corners) => {
  const xs = c.map((p) => p.x);
  const ys = c.map((p) => p.y);
  const x1 = Math.min(...xs), y1 = Math.min(...ys);
  const x2 = Math.max(...xs), y2 = Math.max(...ys);
  return { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
};

export function QuickFixEditor({ outputCode, onCancel, onSave }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);     // svg mount point
  const wrapRef = useRef<HTMLDivElement>(null);     // sized canvas wrapper
  const rootRef = useRef<SVGSVGElement | null>(null);
  const dimsRef = useRef<{ w: number; h: number; widthAttr: string | null; heightAttr: string | null }>({ w: 1080, h: 1080, widthAttr: null, heightAttr: null });
  const undoRef = useRef<string[]>([]);
  const gestureRef = useRef<Gesture | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<SVGGraphicsElement | null>(null);
  const [overlay, setOverlay] = useState<{ corners: Corners; box: ReturnType<typeof aabb>; photo: boolean } | null>(null);
  const [editingText, setEditingText] = useState<{ el: SVGTextElement; value: string } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [wrapSize, setWrapSize] = useState<{ w: number; h: number } | null>(null);

  // Fit the canvas in the current viewport at the design's aspect ratio.
  // On phones (<1024px) the canvas is width-driven: it fills nearly the full
  // screen width with comfortable side gutters and is bounded by the available
  // height. On desktop the original height-led fit is preserved exactly.
  const fitWrap = useCallback((): { w: number; h: number } => {
    const ratio = dimsRef.current.w / dimsRef.current.h || 0.8;
    const isDesktop = window.innerWidth >= 1024;
    if (!isDesktop) {
      // Leave room for side padding and the toolbar; cap by the vertical space.
      let w = window.innerWidth - 32;
      let h = w / ratio;
      const maxH = window.innerHeight * 0.7;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      return { w: Math.max(120, Math.round(w)), h: Math.max(150, Math.round(h)) };
    }
    let h = Math.min(window.innerHeight * 0.74, 1000);
    let w = h * ratio;
    const maxW = window.innerWidth * 0.62;
    if (w > maxW) {
      w = maxW;
      h = w / ratio;
    }
    // Guard against a collapsed/odd viewport producing a degenerate size.
    return { w: Math.max(120, Math.round(w)), h: Math.max(150, Math.round(h)) };
  }, []);

  // ── Mount: parse, ensure viewBox, inline images for display ───────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Stray & (Google Fonts @import) is valid in lenient HTML rendering but
      // fatal to the strict XML parser — escape before parsing.
      const xmlSafe = outputCode.replace(
        /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g,
        "&amp;",
      );
      const doc = new DOMParser().parseFromString(xmlSafe, "image/svg+xml");
      if (doc.querySelector("parsererror")) {
        setError("This design couldn't be parsed for editing.");
        return;
      }
      const root = doc.documentElement as unknown as SVGSVGElement;
      const widthAttr = root.getAttribute("width");
      const heightAttr = root.getAttribute("height");
      if (!root.getAttribute("viewBox") && widthAttr && heightAttr) {
        root.setAttribute("viewBox", `0 0 ${parseFloat(widthAttr)} ${parseFloat(heightAttr)}`);
      }
      const vb = (root.getAttribute("viewBox") ?? "0 0 1080 1080").split(/[\s,]+/).map(Number);
      dimsRef.current = { w: vb[2] || 1080, h: vb[3] || 1080, widthAttr, heightAttr };
      root.removeAttribute("width");
      root.removeAttribute("height");

      // Inline external images for display, remembering original hrefs.
      await Promise.all(
        Array.from(doc.querySelectorAll("image")).map(async (img) => {
          const href =
            img.getAttribute("href") ??
            img.getAttributeNS("http://www.w3.org/1999/xlink", "href");
          if (!href || href.startsWith("data:")) return;
          try {
            const res = await fetch(href);
            if (!res.ok) return;
            const blob = await res.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const fr = new FileReader();
              fr.onload = () => resolve(fr.result as string);
              fr.onerror = reject;
              fr.readAsDataURL(blob);
            });
            img.setAttribute("data-orig-href", href);
            img.setAttribute("href", dataUrl);
            img.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
          } catch {
            /* unreachable image — leave as-is */
          }
        }),
      );
      if (cancelled || !hostRef.current) return;

      hostRef.current.innerHTML = "";
      const live = document.importNode(root, true);
      live.style.width = "100%";
      live.style.height = "100%";
      live.style.display = "block";
      hostRef.current.appendChild(live);
      rootRef.current = live;
      // Record each photo's natural pixel size (hrefs are inlined data URLs, so
      // these load instantly) — needed to pan/zoom a photo inside its frame.
      Array.from(live.querySelectorAll("image")).forEach((img) => {
        const href = img.getAttribute("href");
        if (!href) return;
        const probe = new window.Image();
        probe.onload = () => {
          if (probe.naturalWidth && probe.naturalHeight) {
            img.setAttribute("data-nat-w", String(probe.naturalWidth));
            img.setAttribute("data-nat-h", String(probe.naturalHeight));
          }
        };
        probe.src = href;
      });
      setWrapSize(fitWrap());
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [outputCode]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const serialize = useCallback((forSave: boolean): string => {
    const root = rootRef.current;
    if (!root) return "";
    const clone = root.cloneNode(true) as SVGSVGElement;
    clone.removeAttribute("style");
    if (forSave) {
      clone.querySelectorAll("image[data-orig-href]").forEach((img) => {
        img.setAttribute("href", img.getAttribute("data-orig-href")!);
        img.removeAttribute("data-orig-href");
      });
      clone.querySelectorAll("image[data-nat-w]").forEach((img) => {
        img.removeAttribute("data-nat-w");
        img.removeAttribute("data-nat-h");
      });
      const { widthAttr, heightAttr } = dimsRef.current;
      if (widthAttr) clone.setAttribute("width", widthAttr);
      if (heightAttr) clone.setAttribute("height", heightAttr);
    }
    return new XMLSerializer().serializeToString(clone);
  }, []);

  const pushUndo = useCallback(() => {
    undoRef.current.push(serialize(false));
    if (undoRef.current.length > 40) undoRef.current.shift();
    setCanUndo(true);
  }, [serialize]);

  // A framed photo = an un-transformed clipped <image> whose natural size is
  // known, so we can pan/zoom it inside its frame.
  const framedPhotoInfo = useCallback((el: Element | null): { frame: FrameBox; nat: number } | null => {
    const root = rootRef.current;
    if (!root || !el || el.tagName.toLowerCase() !== "image") return null;
    if (el.getAttribute("transform")) return null;
    const nw = getNum(el, "data-nat-w"), nh = getNum(el, "data-nat-h");
    if (!nw || !nh) return null;
    const frame = frameBoxOf(root, el);
    return frame ? { frame, nat: nw / nh } : null;
  }, []);

  // Frame box → wrapper-pixel corners (via the image's screen CTM).
  const frameCornersPx = useCallback((el: SVGGraphicsElement, frame: FrameBox): Corners | null => {
    const m = el.getScreenCTM();
    const wrapEl = wrapRef.current;
    if (!m || !wrapEl) return null;
    const r = wrapEl.getBoundingClientRect();
    return ([
      [frame.x, frame.y],
      [frame.x + frame.w, frame.y],
      [frame.x + frame.w, frame.y + frame.h],
      [frame.x, frame.y + frame.h],
    ] as const).map(([x, y]) => ({ x: m.a * x + m.c * y + m.e - r.left, y: m.b * x + m.d * y + m.f - r.top }));
  }, []);

  // Put the photo into "none + cover-rect" form (so it can be freely panned),
  // returning its current rect and zoom. Slice-cover centred looks identical.
  const normalizePhoto = useCallback((el: SVGGraphicsElement, frame: FrameBox, nat: number) => {
    const cover1 = coverSize(frame, nat, 1);
    const pa = (el.getAttribute("preserveAspectRatio") || "").toLowerCase();
    const cx = getNum(el, "x"), cy = getNum(el, "y"), cw = getNum(el, "width"), ch = getNum(el, "height");
    let w = cover1.w, h = cover1.h, x: number, y: number, z = 1;
    if (pa.includes("none") && cw && ch && Math.abs(cw / ch - cover1.w / cover1.h) < 0.02) {
      z = Math.max(1, cw / cover1.w);
      w = cw; h = ch;
      x = cx ?? frame.x; y = cy ?? frame.y;
    } else {
      x = frame.x + (frame.w - w) / 2;
      y = frame.y + (frame.h - h) / 2;
    }
    const c = clampCover(frame, x, y, w, h);
    el.setAttribute("preserveAspectRatio", "none");
    el.setAttribute("x", c.x.toFixed(1));
    el.setAttribute("y", c.y.toFixed(1));
    el.setAttribute("width", w.toFixed(1));
    el.setAttribute("height", h.toFixed(1));
    return { x: c.x, y: c.y, w, h, z };
  }, []);

  // Zoom the photo within its frame, anchored on the frame centre.
  const applyZoom = useCallback((el: SVGGraphicsElement, frame: FrameBox, nat: number, z: number) => {
    const curX = getNum(el, "x") ?? frame.x, curY = getNum(el, "y") ?? frame.y;
    const curW = getNum(el, "width") ?? frame.w, curH = getNum(el, "height") ?? frame.h;
    const { w, h } = coverSize(frame, nat, z);
    const fcx = frame.x + frame.w / 2, fcy = frame.y + frame.h / 2;
    const nx = (fcx - curX) / curW, ny = (fcy - curY) / curH;
    const c = clampCover(frame, fcx - nx * w, fcy - ny * h, w, h);
    el.setAttribute("width", w.toFixed(1));
    el.setAttribute("height", h.toFixed(1));
    el.setAttribute("x", c.x.toFixed(1));
    el.setAttribute("y", c.y.toFixed(1));
  }, []);

  const refreshOverlay = useCallback((el: SVGGraphicsElement | null) => {
    if (!el) {
      setOverlay(null);
      return;
    }
    const info = framedPhotoInfo(el);
    if (info) {
      const corners = frameCornersPx(el, info.frame);
      if (corners) {
        setOverlay({ corners, box: aabb(corners), photo: true });
        return;
      }
    }
    const corners = cornersOf(el, wrapRef.current);
    setOverlay(corners ? { corners, box: aabb(corners), photo: false } : null);
  }, [framedPhotoInfo, frameCornersPx]);

  const select = useCallback(
    (el: SVGGraphicsElement | null) => {
      setSelected(el);
      refreshOverlay(el);
    },
    [refreshOverlay],
  );

  // Recompute the canvas size on window resize — without this, opening the
  // editor at one window size and resizing (or opening before layout settles)
  // leaves the canvas mis-sized, which breaks the selection geometry.
  useEffect(() => {
    if (!ready) return;
    const onResize = () => {
      setWrapSize(fitWrap());
      refreshOverlay(selected);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ready, selected, fitWrap, refreshOverlay]);

  // Web fonts (Anton, Montserrat…) load asynchronously after the SVG mounts.
  // Text getBBox() returns fallback-font metrics until they land, so a box drawn
  // on a freshly-selected headline can be the wrong width. Recompute once fonts
  // settle so every selection box is measured against the real glyphs.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) refreshOverlay(selected);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, selected, refreshOverlay]);

  const toUserPoint = useCallback((clientX: number, clientY: number) => {
    const root = rootRef.current!;
    const pt = root.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(root.getScreenCTM()!.inverse());
  }, []);

  /**
   * Pick the most useful selectable element under the cursor: walk from the
   * clicked leaf outward and keep the LARGEST ancestor that is still below the
   * background threshold. So a sticker group selects as one unit, but a
   * whole-canvas wrapper <g> (or the hero photo) is treated as background and
   * skipped — fixing both "a wrapper swallows everything" and "nothing is
   * selectable" when Claude groups the layout.
   */
  const pickSelectable = useCallback((node: Element | null): SVGGraphicsElement | null => {
    const root = rootRef.current;
    if (!root || !node) return null;
    const r = wrapRef.current?.getBoundingClientRect();

    // A <text> is ALWAYS individually selectable so it can be dragged (moved),
    // not just retyped — even when it lives inside a badge/sticker group. This
    // is what makes "move text" work; clicking the group's background (a rect,
    // not the glyphs) still falls through to the group-expansion logic below.
    const textEl = (node.closest?.("text") ?? null) as SVGGraphicsElement | null;
    if (textEl && root.contains(textEl) && cornersOf(textEl, wrapRef.current)) {
      return textEl;
    }

    // A clipped <image> (framed photo) is ALWAYS individually selectable so it
    // can be panned/zoomed inside its frame — otherwise the wrapper-expansion
    // logic below would select its enclosing group instead.
    const imgEl = (node.closest?.("image") ?? null) as SVGGraphicsElement | null;
    if (imgEl && root.contains(imgEl) && imgEl.getAttribute("clip-path") && cornersOf(imgEl, wrapRef.current)) {
      return imgEl;
    }

    // Ancestor chain from the leaf up to (excluding) the root svg.
    const chain: Element[] = [];
    let n: Element | null = node;
    while (n && n !== (root as unknown as Element)) {
      if (root.contains(n)) chain.push(n);
      n = n.parentElement;
    }

    let pick: SVGGraphicsElement | null = null;
    for (const node2 of chain) {
      if (node2.tagName === "defs" || node2.tagName === "style") continue;
      const el = node2 as unknown as SVGGraphicsElement;
      const corners = cornersOf(el, wrapRef.current);
      if (!corners) continue;
      const b = aabb(corners);
      const isBg =
        !!r &&
        b.x2 - b.x1 >= r.width * BG_COVERAGE &&
        b.y2 - b.y1 >= r.height * BG_COVERAGE;
      if (isBg) break; // this ancestor and everything bigger is background
      pick = el; // expand selection outward to prefer the enclosing group
    }
    return pick;
  }, []);

  /**
   * Best selectable element at a screen point. Uses elementsFromPoint so a
   * full-canvas overlay (film grain / halftone texture) drawn ON TOP doesn't
   * eat the click — we walk the z-ordered stack and take the first real,
   * non-background element beneath it.
   */
  const selectableAt = useCallback(
    (clientX: number, clientY: number): SVGGraphicsElement | null => {
      const root = rootRef.current;
      if (!root) return null;
      for (const cand of document.elementsFromPoint(clientX, clientY)) {
        if (!root.contains(cand)) continue;
        const picked = pickSelectable(cand);
        if (picked) return picked;
      }
      return null;
    },
    [pickSelectable],
  );

  // ── Pointer gestures ───────────────────────────────────────────────────────
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (editingText) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Second finger on an active photo-pan → pinch-zoom the photo in its frame.
      const active = gestureRef.current;
      if (pointersRef.current.size >= 2 && active && active.kind === "panImage") {
        const pts = [...pointersRef.current.values()];
        const dist = Math.max(8, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
        const cover1 = coverSize(active.frame, active.nat, 1);
        gestureRef.current = {
          kind: "pinchImage",
          el: active.el,
          frame: active.frame,
          nat: active.nat,
          baseZ: Math.max(1, active.w / cover1.w),
          startDist: dist,
        };
        e.preventDefault();
        return;
      }

      const el = selectableAt(e.clientX, e.clientY);
      select(el);
      if (!el) return;
      e.preventDefault();

      // Framed photo → pan it inside its frame (Canva-style), not move the element.
      const photo = framedPhotoInfo(el);
      if (photo) {
        pushUndo();
        const norm = normalizePhoto(el, photo.frame, photo.nat);
        const p = toUserPoint(e.clientX, e.clientY);
        gestureRef.current = {
          kind: "panImage",
          el,
          frame: photo.frame,
          nat: photo.nat,
          w: norm.w,
          h: norm.h,
          baseX: norm.x,
          baseY: norm.y,
          startX: p.x,
          startY: p.y,
        };
        refreshOverlay(el);
        return;
      }

      const p = toUserPoint(e.clientX, e.clientY);
      pushUndo();
      gestureRef.current = {
        kind: "move",
        el,
        base: el.getAttribute("transform") ?? "",
        startX: p.x,
        startY: p.y,
      };
    },
    [editingText, selectableAt, select, framedPhotoInfo, normalizePhoto, toUserPoint, pushUndo, refreshOverlay],
  );

  const startHandleGesture = useCallback(
    (kind: "resize" | "rotate") => (e: React.PointerEvent) => {
      if (!selected || !overlay) return;
      e.preventDefault();
      e.stopPropagation();
      const p = toUserPoint(e.clientX, e.clientY);
      const { cx, cy } = overlay.box;
      pushUndo();
      gestureRef.current =
        kind === "resize"
          ? {
              kind,
              el: selected,
              base: selected.getAttribute("transform") ?? "",
              cx,
              cy,
              startDist: Math.max(8, Math.hypot(p.x - cx, p.y - cy)),
            }
          : {
              kind,
              el: selected,
              base: selected.getAttribute("transform") ?? "",
              cx,
              cy,
              startAngle: Math.atan2(p.y - cy, p.x - cx),
            };
    },
    [selected, overlay, toUserPoint, pushUndo],
  );

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gestureRef.current;
      if (!g) return;
      // Photo gestures move the image's geometry within its frame (no transform).
      if (g.kind === "panImage") {
        const p = toUserPoint(e.clientX, e.clientY);
        const c = clampCover(g.frame, g.baseX + (p.x - g.startX), g.baseY + (p.y - g.startY), g.w, g.h);
        g.el.setAttribute("x", c.x.toFixed(1));
        g.el.setAttribute("y", c.y.toFixed(1));
        refreshOverlay(g.el);
        return;
      }
      if (g.kind === "pinchImage") {
        const pts = [...pointersRef.current.values()];
        if (pts.length < 2) return;
        const dist = Math.max(8, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
        applyZoom(g.el, g.frame, g.nat, Math.max(1, Math.min(6, g.baseZ * (dist / g.startDist))));
        refreshOverlay(g.el);
        return;
      }
      const p = toUserPoint(e.clientX, e.clientY);
      let prefix = "";
      if (g.kind === "move") {
        prefix = `translate(${(p.x - g.startX).toFixed(1)} ${(p.y - g.startY).toFixed(1)})`;
      } else if (g.kind === "resize") {
        const s = Math.max(0.1, Math.hypot(p.x - g.cx, p.y - g.cy) / g.startDist);
        prefix = `translate(${g.cx} ${g.cy}) scale(${s.toFixed(3)}) translate(${-g.cx} ${-g.cy})`;
      } else {
        const a = ((Math.atan2(p.y - g.cy, p.x - g.cx) - g.startAngle) * 180) / Math.PI;
        prefix = `rotate(${a.toFixed(1)} ${g.cx} ${g.cy})`;
      }
      g.el.setAttribute("transform", `${prefix} ${g.base}`.trim());
      refreshOverlay(g.el);
    }
    function onUp(e: PointerEvent) {
      pointersRef.current.delete(e.pointerId);
      gestureRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [toUserPoint, refreshOverlay, applyZoom]);

  // Desktop scroll-to-zoom on a selected framed photo. Native non-passive
  // listener so we can preventDefault the page/canvas scroll.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !ready) return;
    let lastUndo = 0;
    function onWheel(e: WheelEvent) {
      const el = selected;
      const info = el ? framedPhotoInfo(el) : null;
      if (!el || !info) return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastUndo > 350) pushUndo();
      lastUndo = now;
      const cover1 = coverSize(info.frame, info.nat, 1);
      if (!(el.getAttribute("preserveAspectRatio") || "").toLowerCase().includes("none")) {
        normalizePhoto(el, info.frame, info.nat);
      }
      const curW = getNum(el, "width") ?? cover1.w;
      const z = Math.max(1, Math.min(6, (curW / cover1.w) * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      applyZoom(el, info.frame, info.nat, z);
      refreshOverlay(el);
    }
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [ready, selected, framedPhotoInfo, normalizePhoto, applyZoom, refreshOverlay, pushUndo]);

  // ── Text editing ───────────────────────────────────────────────────────────
  const onCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // Look through the z-stack for a <text> (the grain overlay is on top).
      const root = rootRef.current;
      let t: Element | null = null;
      for (const cand of document.elementsFromPoint(e.clientX, e.clientY)) {
        if (!root?.contains(cand)) continue;
        const text = cand.closest?.("text");
        if (text && root.contains(text)) {
          t = text;
          break;
        }
      }
      if (!t) return;
      e.preventDefault();
      setEditingText({ el: t as SVGTextElement, value: (t.textContent ?? "").trim() });
      select(null);
    },
    [select],
  );

  const commitText = useCallback(() => {
    if (!editingText) return;
    const next = editingText.value;
    if (next !== (editingText.el.textContent ?? "").trim()) {
      pushUndo();
      // Single-line texts (our recipes) — tspans get flattened intentionally.
      editingText.el.textContent = next;
    }
    setEditingText(null);
  }, [editingText, pushUndo]);

  // ── Keyboard: nudge / delete / undo / escape ───────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editingText) {
        if (e.key === "Escape") setEditingText(null);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        const snap = undoRef.current.pop();
        setCanUndo(undoRef.current.length > 0);
        if (snap && hostRef.current) {
          const doc = new DOMParser().parseFromString(snap, "image/svg+xml");
          const live = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
          live.style.width = "100%";
          live.style.height = "100%";
          live.style.display = "block";
          hostRef.current.innerHTML = "";
          hostRef.current.appendChild(live);
          rootRef.current = live;
          select(null);
        }
        return;
      }
      if (e.key === "Escape") {
        select(null);
        return;
      }
      if (!selected) return;
      const step = e.shiftKey ? 10 : 2;
      const nudge = (dx: number, dy: number) => {
        e.preventDefault();
        pushUndo();
        const base = selected.getAttribute("transform") ?? "";
        selected.setAttribute("transform", `translate(${dx} ${dy}) ${base}`.trim());
        refreshOverlay(selected);
      };
      if (e.key === "ArrowLeft") nudge(-step, 0);
      else if (e.key === "ArrowRight") nudge(step, 0);
      else if (e.key === "ArrowUp") nudge(0, -step);
      else if (e.key === "ArrowDown") nudge(0, step);
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        pushUndo();
        selected.remove();
        select(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, editingText, select, pushUndo, refreshOverlay]);

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave(serialize(true));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the edit.");
      setSaving(false);
    }
  }

  // Overlay is drawn in wrapper-pixel space (matching cornersOf output).
  const handleR = 9; // px

  // CSS position helpers for the floating text input (corners already in px)
  const textBox = editingText
    ? cornersOf(editingText.el as unknown as SVGGraphicsElement, wrapRef.current)
    : null;
  const textCss =
    textBox && wrapSize
      ? (() => {
          const b = aabb(textBox);
          return {
            left: Math.max(0, b.x1 - 8),
            top: Math.max(0, b.y1 - 8),
            width: Math.min(wrapSize.w, b.x2 - b.x1 + 160),
          };
        })()
      : null;

  return (
    <div className="fixed inset-0 z-50 flex max-h-[100svh] flex-col bg-[#0a0a0a]/90 backdrop-blur-sm">
      {/* ── Toolbar ── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[rgba(242,238,230,0.1)] bg-[#1C1A18] px-4 py-3 lg:flex-nowrap lg:px-5">
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium text-[#F2EEE6]">Quick fix</p>
          <p className="hidden items-center gap-1.5 text-[11px] text-[#8C8278] lg:flex">
            <MousePointerClick className="h-3.5 w-3.5" />
            click to select · drag to move · drag a photo to reframe it (scroll/pinch to zoom) · handles resize/rotate · double-click text to edit · ⌫ delete · ⌘Z undo
          </p>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2 lg:flex-none">
          {error && <p className="mr-2 min-w-0 flex-1 truncate text-xs text-red-300 lg:flex-none">{error}</p>}
          <button
            onClick={() => {
              const snap = undoRef.current.pop();
              setCanUndo(undoRef.current.length > 0);
              if (snap && hostRef.current) {
                const doc = new DOMParser().parseFromString(snap, "image/svg+xml");
                const live = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
                live.style.width = "100%";
                live.style.height = "100%";
                live.style.display = "block";
                hostRef.current.innerHTML = "";
                hostRef.current.appendChild(live);
                rootRef.current = live;
                select(null);
              }
            }}
            disabled={!canUndo || saving}
            className="flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[#CFC8BD] transition-colors hover:bg-[rgba(242,238,230,0.06)] disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-0"
          >
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[#CFC8BD] transition-colors hover:bg-[rgba(242,238,230,0.06)] disabled:opacity-40 lg:min-h-0"
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !ready}
            className="mm-cta flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-[#F7F3EC] disabled:cursor-wait disabled:opacity-60 lg:min-h-0"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : "Save as new version"}
          </button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="flex flex-1 items-center justify-center overflow-auto p-4 lg:p-6">
        {!ready && !error && (
          <div className="flex items-center gap-2 text-sm text-[#8C8278]">
            <Loader2 className="h-4 w-4 animate-spin text-[#CC7A5C]" /> Preparing editor…
          </div>
        )}
        <div
          ref={wrapRef}
          className="relative max-w-full select-none rounded-lg bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]"
          style={{
            width: wrapSize?.w,
            height: wrapSize?.h,
            display: ready ? "block" : "none",
            touchAction: "none",
          }}
          onPointerDown={onCanvasPointerDown}
          onDoubleClick={onCanvasDoubleClick}
        >
          <div ref={hostRef} className="h-full w-full overflow-hidden rounded-lg" />

          {/* Selection overlay — drawn in wrapper-pixel space (1:1 with corners) */}
          {overlay && wrapSize && (
            <svg
              viewBox={`0 0 ${wrapSize.w} ${wrapSize.h}`}
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <polygon
                points={overlay.corners.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#CC7A5C"
                strokeWidth={2.5}
                strokeDasharray="8 5"
              />
              {/* Photos zoom via scroll/pinch — no resize/rotate handles. */}
              {!overlay.photo && (
                <>
                  {/* Resize handle — bottom-right */}
                  <circle
                    cx={overlay.box.x2}
                    cy={overlay.box.y2}
                    r={handleR}
                    fill="#CC7A5C"
                    stroke="#ffffff"
                    strokeWidth={2.5}
                    style={{ pointerEvents: "all", cursor: "nwse-resize" }}
                    onPointerDown={startHandleGesture("resize")}
                  />
                  {/* Rotate handle — above top-centre */}
                  <line
                    x1={overlay.box.cx}
                    y1={overlay.box.y1}
                    x2={overlay.box.cx}
                    y2={overlay.box.y1 - handleR * 2.4}
                    stroke="#CC7A5C"
                    strokeWidth={2}
                  />
                  <circle
                    cx={overlay.box.cx}
                    cy={overlay.box.y1 - handleR * 2.4}
                    r={handleR * 0.85}
                    fill="#ffffff"
                    stroke="#CC7A5C"
                    strokeWidth={2.5}
                    style={{ pointerEvents: "all", cursor: "grab" }}
                    onPointerDown={startHandleGesture("rotate")}
                  />
                </>
              )}
            </svg>
          )}

          {/* Photo selected → Canva-style reposition hint */}
          {overlay?.photo && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1C1A18]/85 px-3 py-1 text-[11px] text-[#F2EEE6] ring-1 ring-[rgba(242,238,230,0.15)] backdrop-blur-sm">
              Drag to reposition · scroll or pinch to zoom
            </div>
          )}

          {/* Floating text editor */}
          {editingText && textCss && (
            <input
              autoFocus
              value={editingText.value}
              onChange={(e) => setEditingText({ ...editingText, value: e.target.value })}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitText();
                if (e.key === "Escape") setEditingText(null);
              }}
              className="absolute z-10 rounded-md border-2 border-[#CC7A5C] bg-[#1C1A18] px-2 py-1 text-sm text-[#F2EEE6] outline-none"
              style={textCss}
              onPointerDown={(e) => e.stopPropagation()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
