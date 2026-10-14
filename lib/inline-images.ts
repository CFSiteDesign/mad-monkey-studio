/**
 * Inline every <image> href in an SVG as a data URL.
 *
 * Why: browsers block ALL external resource loads (even same-origin) when an
 * SVG is rasterised through an <img> element — which is exactly how PNG/JPG/
 * PDF/DOCX export works. Without inlining, bank photos and the brand logo
 * would render in the live preview but silently vanish from every export.
 */

/** Part of an image's own box that can ever be seen, plus the matching source
 *  crop as fractions of the bitmap (0..1). */
type Trim = { x: number; y: number; w: number; h: number; fx: number; fy: number; fw: number; fh: number };

type Rect = { x: number; y: number; w: number; h: number };

const num = (el: Element, attr: string): number | null => {
  const raw = el.getAttribute(attr);
  if (raw == null || /%/.test(raw)) return null;
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : null;
};

function intersect(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** Bounding box of a simple single-shape clipPath (rect / circle / ellipse) in
 *  the user space of the element it clips; null when it can't be known exactly. */
function clipWindow(el: Element, doc: Document): Rect | null {
  const m = (el.getAttribute("clip-path") ?? "").match(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/);
  if (!m) return null;
  const clip = doc.querySelector(`clipPath[id="${m[1]}"]`);
  if (!clip || clip.getAttribute("transform")) return null;
  if ((clip.getAttribute("clipPathUnits") ?? "userSpaceOnUse") !== "userSpaceOnUse") return null;
  const shapes = Array.from(clip.children);
  if (shapes.length !== 1 || shapes[0].getAttribute("transform")) return null;
  const s = shapes[0];
  const tag = s.localName;
  if (tag === "rect") {
    const x = num(s, "x") ?? 0, y = num(s, "y") ?? 0, w = num(s, "width"), h = num(s, "height");
    return w != null && h != null ? { x, y, w, h } : null;
  }
  if (tag === "circle") {
    const cx = num(s, "cx") ?? 0, cy = num(s, "cy") ?? 0, r = num(s, "r");
    return r != null ? { x: cx - r, y: cy - r, w: r * 2, h: r * 2 } : null;
  }
  if (tag === "ellipse") {
    const cx = num(s, "cx") ?? 0, cy = num(s, "cy") ?? 0, rx = num(s, "rx"), ry = num(s, "ry");
    return rx != null && ry != null ? { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 } : null;
  }
  return null;
}

/** The poster canvas, but only when the image sits directly in root user space
 *  (no transformed / nested-viewport ancestor), so its coordinates are canvas
 *  coordinates. */
function canvasWindow(el: Element, root: Element): Rect | null {
  for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
    if (p.getAttribute("transform")) return null;
    if (!["g", "a", "switch"].includes(p.localName)) return null; // pattern/symbol/svg/mask… change coords
  }
  const vb = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v))) return null;
  return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
}

/**
 * Trim a stretched (preserveAspectRatio="none") photo to the part that can be
 * seen: its own clip window and, when untransformed, the canvas.
 *
 * Why: "Change photo" zooms a photo by giving it a huge box (here 1690×3006 on a
 * 1080×1350 poster) clipped by its own crop rect, inside a clipped frame group.
 * resvg, our export renderer, mis-sizes the nested clip layer for a box that far
 * outside the canvas and drops the bottom of the photo: the preview showed the
 * photo filling its frame, the download stopped ~2/3 of the way down (Katrina,
 * 14 Oct 2026). Cropping the pixels to the visible window and shrinking the box
 * to match is pixel-identical and keeps the renderer well inside its limits.
 */
function trimFor(el: Element, doc: Document): Trim | null {
  if ((el.getAttribute("preserveAspectRatio") ?? "").trim().toLowerCase() !== "none") return null;
  const bx = num(el, "x") ?? 0, by = num(el, "y") ?? 0, bw = num(el, "width"), bh = num(el, "height");
  if (bw == null || bh == null || bw <= 0 || bh <= 0 || el.getAttribute("transform")) return null;
  let vis: Rect | null = { x: bx, y: by, w: bw, h: bh };
  const clip = clipWindow(el, doc);
  if (clip) vis = intersect(vis, clip);
  const canvas = vis ? canvasWindow(el, doc.documentElement) : null;
  if (vis && canvas) vis = intersect(vis, canvas);
  if (!vis) return null; // never visible: leave it alone
  const same = Math.abs(vis.x - bx) < 0.5 && Math.abs(vis.y - by) < 0.5 && Math.abs(vis.w - bw) < 0.5 && Math.abs(vis.h - bh) < 0.5;
  if (same) return null;
  return { ...vis, fx: (vis.x - bx) / bw, fy: (vis.y - by) / bh, fw: vis.w / bw, fh: vis.h / bh };
}

/**
 * Bank photos (~6MB) and the brand logos (~2MB PNGs) are far larger than they
 * ever render. Inlining them at full size bloats the SVG past the export size
 * limit ("Design too large to export") and slows preview/export. Downscale to
 * ≤1600px on the way in — photos to JPEG, local /public logos to PNG (to keep
 * transparency). Falls back to the raw blob if canvas decoding isn't available
 * (and then reports `cropped: false`, so the caller keeps the original box).
 */
async function downscaleToDataUrl(
  blob: Blob,
  href: string,
  maxPx: number,
  trim: Trim | null,
): Promise<{ dataUrl: string; cropped: boolean }> {
  const rawDataUrl = () =>
    new Promise<{ dataUrl: string; cropped: boolean }>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve({ dataUrl: fr.result as string, cropped: false });
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    return rawDataUrl();
  }
  try {
    const bmp = await createImageBitmap(blob);
    // Source window (whole bitmap, or just the visible part of a trimmed photo).
    const sx = trim ? trim.fx * bmp.width : 0;
    const sy = trim ? trim.fy * bmp.height : 0;
    const sw = trim ? trim.fw * bmp.width : bmp.width;
    const sh = trim ? trim.fh * bmp.height : bmp.height;
    const scale = Math.min(1, maxPx / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close?.();
      return rawDataUrl();
    }
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
    bmp.close?.();
    const keepPng = href.startsWith("/"); // local logos → keep transparency
    return { dataUrl: canvas.toDataURL(keepPng ? "image/png" : "image/jpeg", 0.85), cropped: Boolean(trim) };
  } catch {
    return rawDataUrl();
  }
}

const r2 = (v: number) => String(Math.round(v * 100) / 100);

export async function inlineSvgImages(svg: string, maxPx = 1600): Promise<string> {
  // Escape stray & (Google Fonts @import) — the strict XML parser otherwise
  // fails and this function silently skips inlining (and exports lose photos).
  svg = svg.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.querySelector("parsererror")) return svg;

  // Safety net: without a viewBox the artwork can't scale to its container —
  // it renders at natural px size and gets clipped. Derive one from
  // width/height if Claude ever omits it.
  const root = doc.documentElement;
  if (!root.getAttribute("viewBox")) {
    const w = parseFloat(root.getAttribute("width") ?? "");
    const h = parseFloat(root.getAttribute("height") ?? "");
    if (w > 0 && h > 0) root.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }

  const images = Array.from(doc.querySelectorAll("image"));
  if (images.length === 0) return new XMLSerializer().serializeToString(root);

  await Promise.all(
    images.map(async (el) => {
      const href =
        el.getAttribute("href") ??
        el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      if (!href || href.startsWith("data:")) return;

      try {
        const res = await fetch(href);
        if (!res.ok) return;
        const blob = await res.blob();
        const trim = trimFor(el, doc);
        const { dataUrl, cropped } = await downscaleToDataUrl(blob, href, maxPx, trim);
        el.setAttribute("href", dataUrl);
        el.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
        if (trim && cropped) {
          el.setAttribute("x", r2(trim.x));
          el.setAttribute("y", r2(trim.y));
          el.setAttribute("width", r2(trim.w));
          el.setAttribute("height", r2(trim.h));
        }
      } catch {
        // Unreachable image — leave the href; preview may still show it.
      }
    }),
  );

  return new XMLSerializer().serializeToString(doc.documentElement);
}
