// Shared resvg rasterisation — the SINGLE source of truth for turning a
// generated SVG into pixels with the brand fonts. Used by both the pixel
// validator (visibility audit) and PNG/JPG/PDF/DOCX export, so what you see
// validated, previewed and exported all come from the same renderer.
//
// Node-only (native rasteriser + remote font fetch). Call from "use node"
// Convex actions or pixel-validate.

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MONTSERRAT_FONTS_B64, DISPLAY_FONTS_B64, MONT_FAMILY } from "./brand-fonts";
import { normalizeSvgRoot } from "./validate";

let fontsPromise: Promise<Buffer[]> | null = null;
let fontFilesPromise: Promise<string[]> | null = null;

// Every load-bearing brand font is BUNDLED (base64, subset) so server-side export
// never depends on a runtime GitHub fetch — a flaky/blocked fetch used to leave the
// per-process font cache permanently missing Anton (headline) so headlines exported
// in a wide thin fallback. resvg-js (2.6) also can't weight-match Montserrat's
// "RIBBI" static TTFs (every heavy weight claims subfamily "Regular", so resvg
// renders them all at Regular), so each heavy Montserrat weight is bundled RENAMED
// to a unique single-member family ("MMMont900" etc.) and the SVG's font-weight is
// rewritten to that family (remapMontserratWeights). Only the two VARIABLE-weight
// accents (Baloo 2, Caveat) are still fetched — no clean static to bundle — so a
// failed fetch only ever degrades rare script/handwritten accents, never the
// headline, labels or stickers.
const FONT_URLS = [
  "https://raw.githubusercontent.com/google/fonts/main/ofl/baloo2/Baloo2%5Bwght%5D.ttf",
  "https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/Caveat%5Bwght%5D.ttf",
];

const BUNDLED_BUFFERS: Buffer[] = [
  ...Object.values(MONTSERRAT_FONTS_B64),
  ...Object.values(DISPLAY_FONTS_B64),
].map((b64) => Buffer.from(b64, "base64"));

/** All brand font buffers, loaded once per process. Headline/label/sticker fonts
 *  are bundled (base64) so they're ALWAYS present even if the font CDN is down; the
 *  two variable accent fonts are fetched best-effort with a hard per-font timeout
 *  so a slow/unreachable CDN can never hang or block the generation pipeline. */
export function loadBrandFonts(): Promise<Buffer[]> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const results = await Promise.all(
        FONT_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
            if (!res.ok) return null;
            return Buffer.from(await res.arrayBuffer());
          } catch {
            return null;
          }
        }),
      );
      const fetched = results.filter((b) => b !== null) as Buffer[];
      return [...BUNDLED_BUFFERS, ...fetched];
    })().catch((e) => {
      fontsPromise = null; // allow retry on next call
      throw e;
    });
  }
  return fontsPromise;
}

// Rewrite `font-family="Montserrat" font-weight="N"` to the matching renamed
// single-member family ("MMMont600"/"MMMont900"…) so resvg picks the real
// heavy glyphs. Weight 400 keeps the plain "Montserrat" family. Only touches
// elements whose own font-family is Montserrat — other fonts are left alone.
function remapMontserratWeights(svg: string): string {
  return svg.replace(/<(?:text|tspan)\b[^>]*>/gi, (tag) => {
    const ff = tag.match(/font-family\s*=\s*["']([^"']*)["']/i);
    if (!ff || ff[1].trim().toLowerCase() !== "montserrat") return tag;
    const fw = tag.match(/font-weight\s*=\s*["']([^"']+)["']/i);
    let wt = fw ? fw[1].trim().toLowerCase() : "400";
    if (wt === "bold") wt = "700";
    if (wt === "normal" || wt === "regular") wt = "400";
    const fam = MONT_FAMILY[wt];
    if (!fam || fam === "Montserrat") return tag;
    return tag.replace(/font-family\s*=\s*["'][^"']*["']/i, `font-family="${fam}"`);
  });
}

/** Materialise the font buffers to disk (once per process) and return their
 *  paths. resvg-js's `fontBuffers` silently MIS-INDEXES some fonts — Anton (the
 *  default headline face) never matched and every headline exported in the wide
 *  Montserrat fallback. `fontFiles` (paths) indexes them correctly, so we write
 *  the bundled+fetched fonts to a temp dir and feed resvg the paths instead. */
function loadBrandFontFiles(): Promise<string[]> {
  if (!fontFilesPromise) {
    fontFilesPromise = (async () => {
      const buffers = await loadBrandFonts();
      const dir = join(tmpdir(), "mm-brand-fonts");
      mkdirSync(dir, { recursive: true });
      return buffers.map((buf, i) => {
        const p = join(dir, `f${i}.ttf`);
        writeFileSync(p, buf);
        return p;
      });
    })().catch((e) => {
      fontFilesPromise = null; // allow retry on next call
      throw e;
    });
  }
  return fontFilesPromise;
}

/** Make the SVG valid for resvg's strict XML parser. */
function cleanForResvg(svg: string): string {
  return normalizeSvgRoot(remapMontserratWeights(svg))
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
    .replace(/@import\s+url\([^)]*\)\s*;?/gi, ""); // resvg uses bundled fonts, not remote CSS
}

/** Render an SVG to a resvg RenderedImage at the given pixel width. */
export async function renderSvg(svg: string, pxWidth: number) {
  const { Resvg } = await import("@resvg/resvg-js");
  const fontFiles = await loadBrandFontFiles();
  // Use `fontFiles` (paths), NOT `fontBuffers` — the latter mis-indexes Anton
  // and others in resvg-js 2.6.x. `fontFiles` is also absent from the shipped
  // type definitions, hence the cast.
  const resvg = new Resvg(cleanForResvg(svg), {
    font: {
      fontFiles,
      loadSystemFonts: false,
      defaultFontFamily: "Montserrat",
    } as never,
    fitTo: { mode: "width", value: pxWidth },
  });
  return resvg.render(); // { width, height, pixels: RGBA Buffer, asPng() }
}

/** Render an SVG to PNG bytes — fonts guaranteed (loaded as buffers). */
export async function svgToPng(svg: string, pxWidth: number): Promise<Buffer> {
  const img = await renderSvg(svg, pxWidth);
  return Buffer.from(img.asPng());
}

/**
 * Render an SVG to JPEG bytes. resvg only emits PNG (~3MB for a full-bleed
 * photo slide); re-encode its raw RGBA pixels to JPEG here with the pure-JS
 * jpeg-js (no native binary) so the deck PPTX export stays well under Vercel's
 * 4.5MB serverless response limit AND the Vercel route needs zero native deps.
 */
export async function svgToJpeg(svg: string, pxWidth: number, quality = 82): Promise<Buffer> {
  const jpeg = await import("jpeg-js");
  const img = await renderSvg(svg, pxWidth);
  const out = jpeg.encode(
    { data: Buffer.from(img.pixels), width: img.width, height: img.height },
    quality,
  );
  return Buffer.from(out.data);
}
