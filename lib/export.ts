/**
 * Asset export.
 *
 * Claude produces a single SVG. PNG/JPG/PDF/DOCX are built from a raster that
 * is rendered SERVER-SIDE with resvg (which has the brand fonts loaded) —
 * because a browser rasterising an SVG-as-<img> can't fetch the @import Google
 * Fonts and falls back to serif. SVG export is the raw vector (stays editable).
 */

export type ExportKind = "png" | "jpg" | "pdf" | "docx" | "svg";

export const EXPORT_FORMATS: { kind: ExportKind; label: string; ext: string }[] = [
  { kind: "png", label: "PNG image", ext: "png" },
  { kind: "jpg", label: "JPG image", ext: "jpg" },
  { kind: "pdf", label: "PDF document", ext: "pdf" },
  { kind: "docx", label: "Word (DOCX)", ext: "docx" },
  { kind: "svg", label: "SVG (editable)", ext: "svg" },
];

type Dims = { w: number; h: number };

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      mime,
      quality,
    );
  });
}

// ── Brand fonts for the canvas fallback ──────────────────────────────────────
// When the server renderer is down, we rasterise in the browser. A bare SVG-as-
// <img> can't load the @import Google Fonts, so it falls back to a thin system
// serif/sans. Fix: embed the brand fonts as base64 @font-face data-URLs INSIDE
// the SVG (data URLs aren't blocked the way external @import is), so the browser
// renders the real Anton/Montserrat/etc. — and unlike resvg the browser weight-
// matches correctly, so font-weight="900" comes out black. Only the fonts the
// SVG actually references are fetched, and each is cached across exports.
const MONT_BASE =
  "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-";
const MONT_WEIGHT_FILE: Record<number, string> = {
  400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black",
};
const GF = "https://raw.githubusercontent.com/google/fonts/main/";
const OTHER_FONTS: Record<string, { family: string; url: string; variable?: boolean }> = {
  anton: { family: "Anton", url: `${GF}ofl/anton/Anton-Regular.ttf` },
  "archivo black": { family: "Archivo Black", url: `${GF}ofl/archivoblack/ArchivoBlack-Regular.ttf` },
  "titan one": { family: "Titan One", url: `${GF}ofl/titanone/TitanOne-Regular.ttf` },
  bungee: { family: "Bungee", url: `${GF}ofl/bungee/Bungee-Regular.ttf` },
  "baloo 2": { family: "Baloo 2", url: `${GF}ofl/baloo2/Baloo2%5Bwght%5D.ttf`, variable: true },
  caveat: { family: "Caveat", url: `${GF}ofl/caveat/Caveat%5Bwght%5D.ttf`, variable: true },
  "permanent marker": { family: "Permanent Marker", url: `${GF}apache/permanentmarker/PermanentMarker-Regular.ttf` },
};

const fontB64Cache = new Map<string, Promise<string | null>>();
function loadFontB64(url: string): Promise<string | null> {
  let p = fontB64Cache.get(url);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
          bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(bin);
      } catch {
        return null;
      }
    })();
    fontB64Cache.set(url, p);
  }
  return p;
}

function nearestMontWeight(raw: string): number {
  const v = raw.trim().toLowerCase();
  if (v === "bold") return 700;
  if (v === "normal" || v === "regular" || v === "") return 400;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return 400;
  return [400, 500, 600, 700, 800, 900].reduce((a, b) =>
    Math.abs(b - n) < Math.abs(a - n) ? b : a,
  );
}

/** Build @font-face CSS (base64 data-URLs) for every brand font the SVG uses. */
async function buildFontFaceCss(svg: string): Promise<string> {
  const families = new Set<string>();
  for (const m of svg.matchAll(/font-family\s*=\s*["']([^"']+)["']/gi))
    families.add(m[1].trim().toLowerCase());

  const jobs: Promise<string>[] = [];

  if (families.has("montserrat")) {
    const weights = new Set<number>([400]);
    for (const m of svg.matchAll(/font-weight\s*=\s*["']?([a-z0-9]+)["']?/gi))
      weights.add(nearestMontWeight(m[1]));
    for (const w of weights) {
      const url = `${MONT_BASE}${MONT_WEIGHT_FILE[w]}.ttf`;
      jobs.push(
        loadFontB64(url).then((b64) =>
          b64
            ? `@font-face{font-family:'Montserrat';font-weight:${w};font-style:normal;src:url(data:font/ttf;base64,${b64}) format('truetype');}`
            : "",
        ),
      );
    }
  }

  for (const key of Object.keys(OTHER_FONTS)) {
    if (!families.has(key)) continue;
    const f = OTHER_FONTS[key];
    jobs.push(
      loadFontB64(f.url).then((b64) =>
        b64
          ? `@font-face{font-family:'${f.family}';font-weight:${f.variable ? "100 900" : "400"};font-style:normal;src:url(data:font/ttf;base64,${b64}) format('truetype');}`
          : "",
      ),
    );
  }

  return (await Promise.all(jobs)).filter(Boolean).join("");
}

/** Rasterise an SVG STRING to canvas with brand fonts embedded (fallback path). */
async function rasterizeMarkup(
  svgMarkup: string,
  w: number,
  h: number,
  bg?: string,
): Promise<HTMLCanvasElement> {
  const css = await buildFontFaceCss(svgMarkup);
  // Inject the @font-face block as the first child of <svg> so the isolated
  // SVG-image render can resolve the fonts. Also register them on the document
  // (belt-and-suspenders) so the bytes are decoded before we paint.
  const styled = css
    ? svgMarkup.replace(/(<svg\b[^>]*>)/i, `$1<style>${css}</style>`)
    : svgMarkup;
  if (css && typeof document !== "undefined" && "fonts" in document) {
    try {
      await document.fonts.ready;
    } catch {
      /* non-fatal */
    }
  }
  const svgBlob = new Blob([styled], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Download the raw vector SVG — stays fully editable in design tools. */
export function exportSvgString(svgString: string, baseName: string): void {
  downloadBlob(
    new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }),
    `${baseName}.svg`,
  );
}

/**
 * Build the chosen raster format from a server-rendered PNG (correct fonts).
 * PNG ships as-is; JPG/PDF/DOCX re-wrap it. `pngBytes` is the full-resolution
 * resvg PNG; `svgEl` is the on-screen element used only as a font-less canvas
 * fallback if the server render is unavailable.
 */
export async function exportFromPng(
  pngBytes: Uint8Array<ArrayBuffer>,
  kind: Exclude<ExportKind, "svg">,
  dims: Dims,
  baseName: string,
): Promise<void> {
  const { w, h } = dims;
  const pngBlob = new Blob([pngBytes], { type: "image/png" });
  const pngUrl = URL.createObjectURL(pngBlob);
  try {
    if (kind === "png") {
      downloadBlob(pngBlob, `${baseName}.png`);
      return;
    }
    if (kind === "jpg") {
      // JPEG has no alpha — flatten onto white.
      const img = await loadImage(pngUrl);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      downloadBlob(await canvasToBlob(canvas, "image/jpeg", 0.95), `${baseName}.jpg`);
      return;
    }
    if (kind === "pdf") {
      // jsPDF needs a data URL; flatten onto white first.
      const img = await loadImage(pngUrl);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        orientation: w >= h ? "landscape" : "portrait",
        unit: "px",
        format: [w, h],
        hotfixes: ["px_scaling"],
      });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
      pdf.save(`${baseName}.pdf`);
      return;
    }
    // docx
    const maxW = 600;
    const scale = w > maxW ? maxW / w : 1;
    const { Document, Packer, Paragraph, ImageRun } = await import("docx");
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new ImageRun({
                  type: "png",
                  data: pngBytes,
                  transformation: { width: Math.round(w * scale), height: Math.round(h * scale) },
                }),
              ],
            }),
          ],
        },
      ],
    });
    downloadBlob(await Packer.toBlob(doc), `${baseName}.docx`);
  } finally {
    URL.revokeObjectURL(pngUrl);
  }
}

/** Convert base64 PNG (from the server renderer) to bytes for exportFromPng. */
export function pngBase64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  return base64ToBytes(b64);
}

/**
 * Browser fallback for when the server renderer is unreachable. Rasterises the
 * SVG markup to PNG via canvas WITH the brand fonts embedded as @font-face data-
 * URLs, so the download keeps Anton/Montserrat/etc. at the correct weight rather
 * than degrading to a thin system font. `svgMarkup` is the inlined (data-URL
 * images) SVG string already on screen.
 */
export async function canvasFallbackPng(
  svgMarkup: string,
  dims: Dims,
): Promise<Uint8Array<ArrayBuffer>> {
  const canvas = await rasterizeMarkup(svgMarkup, dims.w, dims.h);
  const blob = await canvasToBlob(canvas, "image/png");
  return new Uint8Array(await blob.arrayBuffer());
}
