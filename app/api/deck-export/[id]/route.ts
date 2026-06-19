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
    // Render each slide → PNG via Convex (resvg runs there with the brand fonts;
    // this Vercel route runtime can't load the native rasteriser, which is why
    // the old in-route render failed to export). Images are inlined HERE first
    // because the brand logos live in this app's /public dir.
    const slideImages = await Promise.all(
      deck.slides.map(async (svg) => {
        const inlined = await inlineImages(svg);
        const { base64 } = await client.action(api.render.rasterizeForExport, {
          svg: inlined,
          width: SLIDE_PX_WIDTH,
        });
        return `data:image/png;base64,${base64}`;
      }),
    );

    // Assemble a 16:9 PowerPoint — each slide is a full-bleed image.
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "MM_16x9", width: 13.333, height: 7.5 });
    pptx.layout = "MM_16x9";
    pptx.author = "Mad Monkey Studio";
    pptx.title = deck.title;
    for (const data of slideImages) {
      const slide = pptx.addSlide();
      slide.addImage({ data, x: 0, y: 0, w: 13.333, h: 7.5 });
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
