"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sanitizeSvg } from "@/lib/sanitize-svg";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { inlineSvgImages } from "@/lib/inline-images";
import { FORMAT_DIMENSIONS } from "@/lib/prompt";
import {
  EXPORT_FORMATS,
  exportSvgString,
  exportFromPng,
  pngBase64ToBytes,
  canvasFallbackPng,
  type ExportKind,
} from "@/lib/export";
import { QuickFixEditor } from "@/components/quick-fix-editor";
import {
  Check,
  ChevronDown,
  Download,
  FileImage,
  FileType,
  FileText,
  Loader2,
  PenTool,
  Pencil,
} from "lucide-react";

const EXPORT_ICONS: Record<ExportKind, typeof FileImage> = {
  png: FileImage,
  jpg: FileImage,
  pdf: FileType,
  docx: FileText,
  svg: PenTool,
};

const ASPECT: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "A4": "aspect-[794/1123]",
};

export type FeedGeneration = {
  id: string;
  outputCode: string;
  format: string;
  designSystem: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  retryCount?: number;
  notes?: string[];
  isManualEdit?: boolean;
};

/**
 * One generation in the chat feed — artwork, meta bar and its own export
 * menu, so every version in a refinement thread stays saveable.
 */
export function GenerationCard({
  gen,
  version,
}: {
  gen: FeedGeneration;
  version: number;
}) {
  const [svg, setSvg] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [editing, setEditing] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const saveManualEdit = useMutation(api.edits.saveManualEdit);
  const rasterize = useAction(api.render.rasterize);

  // Inline bank photos / logos as data URLs so exports keep them (idempotent —
  // data: hrefs are skipped, so re-running on a fresh result is free).
  useEffect(() => {
    let cancelled = false;
    inlineSvgImages(gen.outputCode).then((s) => {
      if (!cancelled) setSvg(s);
    });
    return () => {
      cancelled = true;
    };
  }, [gen.outputCode]);

  // Defense-in-depth against SVG XSS before it touches the DOM (keeps brand
  // presentation attrs like dominant-baseline that DOMPurify would otherwise strip).
  const safeSvg = useMemo(() => (svg ? sanitizeSvg(svg) : ""), [svg]);

  async function handleExport(kind: ExportKind) {
    if (exporting) return;
    const svgEl = canvasRef.current?.querySelector("svg");
    if (!svgEl) return;
    const dim = FORMAT_DIMENSIONS[gen.format] ?? { w: 1080, h: 1080 };
    const baseName = `mm-studio-${gen.designSystem}-${gen.format.replace(":", "x")}-v${version}`;
    // Crisp but lean: normalise every format to ~2560px on the long edge — far
    // sharper than the 1080px preview, while keeping the render fast and the
    // returned PNG small (true 4K hung the export ~30s on a ~20MB response).
    // exportFromPng auto-falls back to a high-quality JPEG if a photo-heavy PNG
    // would top 5MB, so downloads stay crystal-clear AND under 5MB.
    const longEdge = Math.max(dim.w, dim.h);
    const scale = Math.min(2560 / longEdge, 4);
    const renderDim = { w: Math.round(dim.w * scale), h: Math.round(dim.h * scale) };
    setExporting(kind);
    setExportOpen(false);
    try {
      // Re-inline images for the export (preview stays light). 2000px source is
      // ample for a 2560px render and keeps the upload + render quick.
      const exportSvg = sanitizeSvg(await inlineSvgImages(gen.outputCode, 2000));
      if (kind === "svg") {
        exportSvgString(exportSvg, baseName);
        return;
      }
      // Render the raster server-side (resvg → correct brand fonts), retrying a
      // couple of times because the backend can be briefly unreachable between
      // restarts. Only if it stays down do we use the browser canvas — which now
      // embeds the brand fonts too, so the download keeps its weights either way.
      let pngBytes: Uint8Array<ArrayBuffer> | null = null;
      for (let attempt = 0; attempt < 3 && !pngBytes; attempt++) {
        try {
          const { base64 } = await rasterize({ svg: exportSvg, width: renderDim.w });
          pngBytes = pngBase64ToBytes(base64);
        } catch (err) {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          else console.warn("Server render unavailable — using font-embedded fallback:", err);
        }
      }
      if (!pngBytes) pngBytes = await canvasFallbackPng(exportSvg, renderDim);
      await exportFromPng(pngBytes, kind, renderDim, baseName);
    } finally {
      setExporting(null);
    }
  }

  // Close export menu on outside click / Escape
  useEffect(() => {
    if (!exportOpen) return;
    function onClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node))
        setExportOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExportOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportOpen]);

  return (
    <div className="flex w-full flex-col items-center gap-4 mm-fade-up">
      {/* Artwork */}
      <div
        ref={canvasRef}
        className={`${ASPECT[gen.format] ?? "aspect-square"} overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-[rgba(242,238,230,0.1)] [&>svg]:block [&>svg]:h-full [&>svg]:w-full`}
        style={{ height: "calc(100vh - 280px)" }}
      >
        {safeSvg ? (
          <div
            className="h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: safeSvg }}
          />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#8C8278]" />
          </div>
        )}
      </div>

      {/* Meta bar */}
      <div className="mm-card flex items-center gap-4 rounded-full px-2 py-1.5 pl-4">
        <span className="rounded-full bg-[rgba(242,238,230,0.06)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-[#8C8278]">
          v{version}
        </span>
        {gen.isManualEdit ? (
          <span
            className="flex items-center gap-1 text-[11px] font-medium text-[#CFC8BD]"
            title="Adjusted by hand in Quick fix — not re-validated against brand rules"
          >
            <Pencil className="h-3 w-3" />
            hand-edited
          </span>
        ) : gen.notes && gen.notes.length > 0 ? (
          <span
            className="flex items-center gap-1 text-[11px] font-medium text-[#e0a857]"
            title={`On-brand, but a few layout details to eyeball:\n• ${gen.notes.join("\n• ")}\n\nRefine to nudge them.`}
          >
            <Check className="h-3.5 w-3.5" />
            on-brand · {gen.notes.length} to eyeball
          </span>
        ) : (
          <span
            className="flex items-center gap-1 text-[11px] font-medium text-[#9ddb6e]"
            title={
              gen.retryCount
                ? `Validated against brand rules — auto-corrected ${gen.retryCount} time${gen.retryCount > 1 ? "s" : ""}`
                : "Validated against brand rules — passed first time"
            }
          >
            <Check className="h-3.5 w-3.5" />
            on-brand
            {gen.retryCount ? (
              <span className="text-[#8C8278]">
                · {gen.retryCount} fix{gen.retryCount > 1 ? "es" : ""}
              </span>
            ) : null}
          </span>
        )}
        <span className="h-3 w-px bg-[rgba(242,238,230,0.12)]" />
        <span className="font-mono text-[11px] text-[#8C8278]">
          <span className="text-[#CFC8BD]">
            {(gen.inputTokens + gen.outputTokens).toLocaleString()}
          </span>{" "}
          tokens
          <span className="mx-2 text-[#8C8278]/40">·</span>
          <span className="text-[#CFC8BD]">${gen.costUsd.toFixed(4)}</span>
        </span>

        {/* Quick fix — hand-edit this version */}
        <button
          onClick={() => setEditing(true)}
          disabled={!svg}
          title="Move, resize and retype elements by hand"
          className="flex cursor-pointer items-center gap-1.5 rounded-full bg-[rgba(242,238,230,0.06)] px-3.5 py-1.5 text-xs font-medium text-[#F2EEE6] transition-colors hover:bg-[rgba(242,238,230,0.12)] disabled:cursor-wait disabled:opacity-70"
        >
          <Pencil className="h-3.5 w-3.5" />
          Quick fix
        </button>

        {/* Export menu */}
        <div ref={exportRef} className="relative">
          <button
            onClick={() => setExportOpen((o) => !o)}
            disabled={!!exporting || !safeSvg}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-[rgba(242,238,230,0.06)] px-3.5 py-1.5 text-xs font-medium text-[#F2EEE6] transition-colors hover:bg-[rgba(242,238,230,0.12)] disabled:cursor-wait disabled:opacity-70"
          >
            {exporting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Exporting {exporting.toUpperCase()}…
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                Export
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${exportOpen ? "rotate-180" : ""}`}
                />
              </>
            )}
          </button>

          {exportOpen && !exporting && (
            <div
              role="menu"
              className="mm-card absolute bottom-11 right-0 z-50 w-44 rounded-xl p-1.5 mm-fade-up"
            >
              <p className="mm-eyebrow px-2.5 pb-1.5 pt-1">Download as</p>
              {EXPORT_FORMATS.map(({ kind, label }) => {
                const Icon = EXPORT_ICONS[kind];
                return (
                  <button
                    key={kind}
                    role="menuitem"
                    onClick={() => handleExport(kind)}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-[#F2EEE6] transition-colors hover:bg-[rgba(242,238,230,0.06)]"
                  >
                    <Icon className="h-4 w-4 text-[#8C8278]" />
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick-fix editor — saving adds a new version to this chat */}
      {editing && (
        <QuickFixEditor
          outputCode={gen.outputCode}
          onCancel={() => setEditing(false)}
          onSave={async (edited) => {
            await saveManualEdit({
              generationId: gen.id as Id<"generations">,
              outputCode: edited,
            });
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

