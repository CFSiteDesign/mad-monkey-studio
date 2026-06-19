import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import PptxGenJS from "pptxgenjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export const runtime = "nodejs";
export const maxDuration = 120;

const PUBLIC_DIR = path.join(process.cwd(), "public");
const SLIDE_PX_WIDTH = 1920;

// Node-native <image> inliner (the browser inliner uses DOMParser/FileReader).
// Public-folder logos are read off disk; bank photos are fetched over http.
async function inlineImages(svg: string): Promise<string> {
  const hrefs = new Set<string>();
  for (const m of svg.matchAll(/(?:xlink:)?href\s*=\s*"([^"]+)"/gi)) {
    const h = m[1];
    if (h && !h.startsWith("data:") && !h.startsWith("#")) hrefs.add(h);
  }
  for (const href of hrefs) {
    try {
      let buf: Buffer;
      let mime: string;
      if (href.startsWith("/")) {
        buf = await fs.readFile(path.join(PUBLIC_DIR, href));
        mime = href.endsWith(".jpg") || href.endsWith(".jpeg") ? "image/jpeg" : "image/png";
      } else if (/^https?:/i.test(href)) {
        const r = await fetch(href);
        if (!r.ok) continue;
        buf = Buffer.from(await r.arrayBuffer());
        mime = r.headers.get("content-type") || "image/png";
      } else {
        continue;
      }
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      svg = svg.split(`"${href}"`).join(`"${dataUrl}"`);
    } catch {
      /* unreachable asset — leave href, resvg just skips it */
    }
  }
  return svg;
}

const SLIDE_W = 1920;
const SLIDE_H = 1080;
const PPT_W = 13.333;
const PPT_H = 7.5;

// The slide bakes a ~40px logo into the JPEG, which pixelates. We strip it and
// re-place a crisp high-res PNG on top in the pptx so PowerPoint downscales the
// 600px source sharply instead of showing the tiny baked version.
const LOGO_HD: Record<string, string> = {
  "/mm-logo-white.png": "/mm-logo-white-hd.png",
  "/mm-logo-black.png": "/mm-logo-black-hd.png",
};
const LOGO_RE = /<image\b[^>]*\bhref="(\/mm-logo-(?:white|black)\.png)"[^>]*>/gi;

function numAttr(tag: string, name: string): number | null {
  const m = tag.match(new RegExp(`\\b${name}="\\s*(-?[\\d.]+)`));
  return m ? parseFloat(m[1]) : null;
}

// HD logo data URL + intrinsic PNG size (IHDR), read once per file.
const logoCache = new Map<string, { data: string; w: number; h: number } | null>();
async function loadLogo(href: string) {
  const hd = LOGO_HD[href] ?? href;
  if (logoCache.has(hd)) return logoCache.get(hd)!;
  let result: { data: string; w: number; h: number } | null = null;
  try {
    const buf = await fs.readFile(path.join(PUBLIC_DIR, hd));
    result = {
      data: `data:image/png;base64,${buf.toString("base64")}`,
      w: buf.readUInt32BE(16),
      h: buf.readUInt32BE(20),
    };
  } catch {
    result = null;
  }
  logoCache.set(hd, result);
  return result;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return NextResponse.json({ error: "Convex URL not set" }, { status: 500 });

  const client = new ConvexHttpClient(url);
  const deck = await client.query(api.decksInternal.getDeckForExport, {
    deckId: id as Id<"decks">,
  });
  if (!deck) return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
  if (!deck.slides.length) {
    return NextResponse.json({ error: "No slides to export yet" }, { status: 409 });
  }

  try {
    // Crisp logos/text need higher JPEG quality, but the whole pptx must stay
    // under Vercel's 4.5MB response limit — so scale quality to slide count.
    // q82 left brand marks fuzzy; q90 is clean and ~3.4MB for an 8-slide deck.
    const n = deck.slides.length;
    const quality = n <= 8 ? 90 : n <= 11 ? 85 : 80;

    // For each slide: strip the baked (tiny, pixelated) brand logo from the SVG,
    // rasterise the rest to a JPEG background in Convex (resvg runs there with
    // the brand fonts; this Vercel runtime can't load the native rasteriser),
    // and remember the logo's box so we can re-place a crisp high-res PNG on top
    // in the pptx. rasterizeForExport returns JPEG + { error } (never throws, so
    // the real reason isn't redacted to "Server Error").
    const slides = await Promise.all(
      deck.slides.map(async (svg) => {
        const overlays: { data: string; x: number; y: number; w: number; h: number }[] = [];
        let bgSvg = svg;
        for (const m of svg.matchAll(LOGO_RE)) {
          const tag = m[0];
          const logo = await loadLogo(m[1]);
          const x = numAttr(tag, "x");
          const y = numAttr(tag, "y");
          const bw = numAttr(tag, "width");
          const bh = numAttr(tag, "height");
          if (!logo || x == null || y == null || bw == null || bh == null) continue;
          // Fit the logo inside its box preserving aspect (SVG "meet"), centred.
          const imgA = logo.w / logo.h;
          const boxA = bw / bh;
          let fw = bw, fh = bh, fx = x, fy = y;
          if (imgA > boxA) { fh = bw / imgA; fy = y + (bh - fh) / 2; }
          else { fw = bh * imgA; fx = x + (bw - fw) / 2; }
          overlays.push({
            data: logo.data,
            x: (fx / SLIDE_W) * PPT_W,
            y: (fy / SLIDE_H) * PPT_H,
            w: (fw / SLIDE_W) * PPT_W,
            h: (fh / SLIDE_H) * PPT_H,
          });
          bgSvg = bgSvg.replace(tag, ""); // strip only the logos we re-place
        }
        const inlined = await inlineImages(bgSvg);
        const res = await client.action(api.render.rasterizeForExport, {
          svg: inlined,
          width: SLIDE_PX_WIDTH,
          quality,
        });
        if (res.error || !res.base64) throw new Error(res.error ?? "empty render");
        return { bg: `data:image/jpeg;base64,${res.base64}`, overlays };
      }),
    );

    // Assemble a 16:9 PowerPoint — full-bleed slide JPEG + crisp logo overlay.
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "MM_16x9", width: PPT_W, height: PPT_H });
    pptx.layout = "MM_16x9";
    pptx.author = "Mad Monkey Studio";
    pptx.title = deck.title;
    for (const s of slides) {
      const slide = pptx.addSlide();
      slide.addImage({ data: s.bg, x: 0, y: 0, w: PPT_W, h: PPT_H });
      for (const o of s.overlays) {
        slide.addImage({ data: o.data, x: o.x, y: o.y, w: o.w, h: o.h });
      }
    }

    const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
    const filename = `${(deck.title || "presentation").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pptx`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    // Surface the real reason (e.g. "Could not find public function
    // render:rasterizeForExport" when the Convex backend isn't deployed yet)
    // instead of a generic 500, so the client can show it.
    const message = err instanceof Error ? err.message : "Unknown export error";
    console.error("deck-export failed:", message);
    return NextResponse.json({ error: `Export failed: ${message}` }, { status: 500 });
  }
}
