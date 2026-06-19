/**
 * Inline every <image> href in an SVG as a data URL.
 *
 * Why: browsers block ALL external resource loads (even same-origin) when an
 * SVG is rasterised through an <img> element — which is exactly how PNG/JPG/
 * PDF/DOCX export works. Without inlining, bank photos and the brand logo
 * would render in the live preview but silently vanish from every export.
 */

/**
 * Bank photos (~6MB) and the brand logos (~2MB PNGs) are far larger than they
 * ever render. Inlining them at full size bloats the SVG past the export size
 * limit ("Design too large to export") and slows preview/export. Downscale to
 * ≤1600px on the way in — photos to JPEG, local /public logos to PNG (to keep
 * transparency). Falls back to the raw blob if canvas decoding isn't available.
 */
async function downscaleToDataUrl(blob: Blob, href: string, maxPx: number): Promise<string> {
  const rawDataUrl = () =>
    new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    return rawDataUrl();
  }
  try {
    const bmp = await createImageBitmap(blob);
    const MAX = maxPx;
    const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close?.();
      return rawDataUrl();
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const keepPng = href.startsWith("/"); // local logos → keep transparency
    return canvas.toDataURL(keepPng ? "image/png" : "image/jpeg", 0.85);
  } catch {
    return rawDataUrl();
  }
}

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
        const dataUrl = await downscaleToDataUrl(blob, href, maxPx);
        el.setAttribute("href", dataUrl);
        el.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
      } catch {
        // Unreachable image — leave the href; preview may still show it.
      }
    }),
  );

  return new XMLSerializer().serializeToString(doc.documentElement);
}
