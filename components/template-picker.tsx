"use client";

// Templates: the approved reference designs the team creates from.
//  - mode="pick"   → image-first grid of APPROVED templates; click to choose.
//  - mode="manage" → marketing/admin: upload a reference, approve / retire /
//                    delete, grouped by status. Every action is gated server-side too.
import { useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Check, ImagePlus, Loader2, Search, Sparkles, Trash2, X } from "lucide-react";

export type TemplateCard = {
  _id: Id<"templates">;
  name: string;
  description: string;
  format: string;
  designSystem: string;
  status: string;
  imageUrl: string | null;
};

const ASPECT: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  A4: "aspect-[794/1123]",
};
const FORMAT_LABEL: Record<string, string> = { "1:1": "Square", "4:5": "Insta post", "9:16": "Story", A4: "Poster" };
const SYSTEM_LABEL: Record<string, string> = { brand: "Brand", "girly-pop": "Girly Pop", "minimal-bold": "Minimal Bold" };
// Show a search box once the grid is long enough to need one.
const SEARCH_AT = 8;

export function TemplatePicker({
  mode,
  onPick,
  selectedId,
  limit,
  templates: override,
}: {
  mode: "pick" | "manage";
  onPick?: (t: TemplateCard) => void;
  selectedId?: Id<"templates"> | null;
  /** Pick mode: show at most this many, no search, nothing when empty. */
  limit?: number;
  /** Preview/dev: render these instead of the live query. */
  templates?: TemplateCard[];
}) {
  const live = useQuery(api.templates.listTemplates);
  const data = override ? { templates: override, canManage: false } : live;
  const approve = useMutation(api.templates.approveTemplate);
  const reject = useMutation(api.templates.rejectTemplate);
  const remove = useMutation(api.templates.deleteTemplate);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const templates = (data?.templates ?? []) as TemplateCard[];
  const canManage = data?.canManage ?? false;
  const needle = q.trim().toLowerCase();
  const matches = (t: TemplateCard) => !needle || `${t.name} ${t.description}`.toLowerCase().includes(needle);
  const approved = useMemo(() => templates.filter((t) => t.status === "approved"), [templates]);
  const pending = useMemo(() => templates.filter((t) => t.status === "pending"), [templates]);
  const rejected = useMemo(() => templates.filter((t) => t.status === "rejected"), [templates]);

  if (data === undefined) return <SkeletonGrid />;

  const act = async (id: Id<"templates">, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const grid = (items: TemplateCard[], offset = 0) => (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((t, i) => (
        <Card
          key={t._id}
          t={t}
          i={i + offset}
          mode={mode}
          selected={selectedId === t._id}
          canManage={canManage}
          busy={busy === t._id}
          onPick={onPick}
          onApprove={() => act(t._id, () => approve({ templateId: t._id }))}
          onRetire={() => act(t._id, () => reject({ templateId: t._id }))}
          onDelete={() => {
            if (confirm(`Delete "${t.name}"?`)) void act(t._id, () => remove({ templateId: t._id }));
          }}
        />
      ))}
    </div>
  );

  const searchBox = (total: number) =>
    total >= SEARCH_AT ? (
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8C8278]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search templates"
          aria-label="Search templates"
          className="mm-field w-full rounded-lg py-2 pl-9 pr-3 text-sm text-[#F2EEE6] placeholder:text-[#8C8278]/55"
        />
      </div>
    ) : null;

  if (mode === "pick") {
    if (limit) {
      const top = approved.slice(0, limit);
      return top.length ? grid(top) : null;
    }
    if (approved.length === 0) {
      return (
        <div className="mm-fade-up rounded-xl border border-dashed border-[rgba(242,238,230,0.12)] px-4 py-12 text-center">
          <Sparkles className="mx-auto h-5 w-5 text-[#CC7A5C]" />
          <p className="mt-2 text-sm text-[#F2EEE6]">No templates yet</p>
          <p className="mt-1 text-xs text-[#8C8278]">The marketing team is adding them.</p>
        </div>
      );
    }
    const shown = approved.filter(matches);
    return (
      <div>
        {searchBox(approved.length)}
        {shown.length ? grid(shown) : <NoMatch q={q} />}
      </div>
    );
  }

  const shownPending = pending.filter(matches);
  const shownApproved = approved.filter(matches);
  const shownRejected = rejected.filter(matches);
  return (
    <div className="space-y-8">
      {canManage && <UploadReference />}
      {searchBox(templates.length)}
      {shownPending.length > 0 && (
        <section className="space-y-3">
          <h3 className="mm-eyebrow flex items-center gap-2">
            Waiting for approval
            <span className="rounded-full bg-[#FFC72C]/15 px-1.5 text-[10px] text-[#FFC72C]">{shownPending.length}</span>
          </h3>
          {grid(shownPending)}
        </section>
      )}
      <section className="space-y-3">
        <h3 className="mm-eyebrow">Live for GMs · {shownApproved.length}</h3>
        {shownApproved.length ? (
          grid(shownApproved, shownPending.length)
        ) : needle ? (
          <NoMatch q={q} />
        ) : (
          <p className="text-xs text-[#8C8278]">Nothing live yet. Upload a reference above, then approve it.</p>
        )}
      </section>
      {shownRejected.length > 0 && (
        <section className="space-y-3">
          <h3 className="mm-eyebrow text-[#8C8278]">Retired · {shownRejected.length}</h3>
          {grid(shownRejected, shownPending.length + shownApproved.length)}
        </section>
      )}
    </div>
  );
}

function NoMatch({ q }: { q: string }) {
  return <p className="py-8 text-center text-xs text-[#8C8278]">Nothing matches “{q.trim()}”.</p>;
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-busy>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="mm-fade-up" style={{ animationDelay: `${i * 35}ms` }}>
          <div className="mm-shimmer aspect-[4/5] rounded-xl border border-[rgba(242,238,230,0.06)] bg-[#141210]" />
          <div className="mt-2.5 h-3 w-2/3 rounded bg-[rgba(242,238,230,0.06)]" />
          <div className="mt-1.5 h-2 w-1/3 rounded bg-[rgba(242,238,230,0.04)]" />
        </div>
      ))}
    </div>
  );
}

// Hoisted so React keeps the same component identity across renders: cards
// defined inline would remount (and replay their entrance) on every update.
function Card({
  t,
  i,
  mode,
  selected,
  canManage,
  busy,
  onPick,
  onApprove,
  onRetire,
  onDelete,
}: {
  t: TemplateCard;
  i: number;
  mode: "pick" | "manage";
  selected: boolean;
  canManage: boolean;
  busy: boolean;
  onPick?: (t: TemplateCard) => void;
  onApprove: () => void;
  onRetire: () => void;
  onDelete: () => void;
}) {
  const pickable = mode === "pick";
  const frame = (
    <>
      <div
        className={`relative overflow-hidden rounded-xl border bg-[#141210] ${ASPECT[t.format] ?? "aspect-[4/5]"} ${
          selected
            ? "border-[#CC7A5C] ring-2 ring-[#CC7A5C]/35"
            : "border-[rgba(242,238,230,0.08)] group-hover:border-[rgba(242,238,230,0.28)]"
        }`}
      >
        {t.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={t.imageUrl}
            alt={t.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-contain p-1.5 transition-transform duration-500 ease-out group-hover:scale-[1.025]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-[#8C8278]/40">
            <ImagePlus className="h-5 w-5" />
          </div>
        )}
        {pickable && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          />
        )}
        {pickable && !selected && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 translate-y-1.5 rounded-full bg-[#F2EEE6] px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-[#1C1A18] opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
          >
            Use this
          </span>
        )}
        {selected && (
          <span className="mm-pop absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[#CC7A5C] text-[#1C1A18] shadow">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
        {mode === "manage" && t.status !== "approved" && (
          <span
            className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-widest backdrop-blur ${
              t.status === "pending" ? "bg-[#FFC72C]/20 text-[#FFC72C]" : "bg-[#1C1A18]/80 text-[#8C8278]"
            }`}
          >
            {t.status === "pending" ? "Pending" : "Retired"}
          </span>
        )}
      </div>
      <div className="mt-2.5 px-0.5">
        <p className="truncate text-[13px] font-medium leading-tight text-[#F2EEE6]">{t.name}</p>
        <p className="mt-1 text-[10px] uppercase tracking-widest text-[#8C8278]">
          {FORMAT_LABEL[t.format] ?? t.format}
          {mode === "manage" ? ` · ${SYSTEM_LABEL[t.designSystem] ?? t.designSystem}` : ""}
        </p>
      </div>
    </>
  );

  return (
    <div className="mm-fade-up group relative" style={{ animationDelay: `${Math.min(i, 16) * 35}ms` }}>
      {pickable ? (
        <button
          type="button"
          onClick={() => onPick?.(t)}
          aria-pressed={selected}
          className="mm-tile block w-full cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#CC7A5C]/60"
        >
          {frame}
        </button>
      ) : (
        <div className="mm-tile block w-full">{frame}</div>
      )}
      {mode === "manage" && canManage && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
          {t.status !== "approved" && (
            <button
              type="button"
              title="Approve: GMs can use it"
              disabled={busy}
              onClick={onApprove}
              className="mm-press grid h-7 w-7 cursor-pointer place-items-center rounded-md bg-[#1C1A18]/90 text-emerald-300 backdrop-blur hover:bg-emerald-500/20"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
          )}
          {t.status === "approved" && (
            <button
              type="button"
              title="Retire: hide from GMs"
              disabled={busy}
              onClick={onRetire}
              className="mm-press grid h-7 w-7 cursor-pointer place-items-center rounded-md bg-[#1C1A18]/90 text-[#CFC8BD] backdrop-blur hover:bg-[#FFC72C]/20 hover:text-[#FFC72C]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            title="Delete"
            disabled={busy}
            onClick={onDelete}
            className="mm-press grid h-7 w-7 cursor-pointer place-items-center rounded-md bg-[#1C1A18]/90 text-[#8C8278] backdrop-blur hover:bg-red-500/20 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Marketing/admin: drop a reference design in, name it, tag format + system. */
function UploadReference() {
  const generateUploadUrl = useMutation(api.templates.generateUploadUrl);
  const createTemplate = useMutation(api.templates.createTemplate);
  const describeTemplate = useAction(api.templatesActions.describeTemplate);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [format, setFormat] = useState("4:5");
  const [designSystem, setDesignSystem] = useState("brand");
  const [stage, setStage] = useState<"idle" | "uploading" | "reading" | "done">("idle");
  const [error, setError] = useState("");

  function pick(f: File | null) {
    setFile(f);
    setError("");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
    if (f && !name) setName(f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || stage !== "idle") return;
    setError("");
    try {
      setStage("uploading");
      const url = await generateUploadUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!res.ok) throw new Error("Upload failed.");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const templateId = await createTemplate({ storageId, name: name.trim() || "Untitled template", format, designSystem });
      setStage("reading");
      await describeTemplate({ templateId });
      setStage("done");
      setTimeout(() => {
        pick(null);
        setName("");
        setStage("idle");
        if (fileRef.current) fileRef.current.value = "";
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("idle");
    }
  }

  return (
    <form onSubmit={submit} className="mm-card mm-fade-up rounded-xl p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <label
          className={`relative grid w-full shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed bg-[#141210] transition-colors duration-200 sm:w-44 ${ASPECT[format] ?? "aspect-square"} ${
            preview ? "border-transparent" : "border-[rgba(242,238,230,0.2)] hover:border-[#CC7A5C]/60"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-contain p-1.5" />
          ) : (
            <span className="flex flex-col items-center gap-1.5 px-3 text-center text-[11px] text-[#8C8278]">
              <ImagePlus className="h-5 w-5 text-[#CC7A5C]" />
              Drop a reference design
            </span>
          )}
        </label>
        <div className="flex flex-1 flex-col gap-2.5">
          <p className="text-[11px] font-medium text-[#CFC8BD]">New template</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name, e.g. Neon party poster"
            className="mm-field w-full rounded-lg px-3 py-2 text-sm text-[#F2EEE6] placeholder:text-[#8C8278]/55"
          />
          <div className="grid grid-cols-2 gap-2">
            <select value={format} onChange={(e) => setFormat(e.target.value)} className="mm-field rounded-lg px-3 py-2 text-sm text-[#F2EEE6]">
              {Object.entries(FORMAT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v} · {k}
                </option>
              ))}
            </select>
            <select
              value={designSystem}
              onChange={(e) => setDesignSystem(e.target.value)}
              aria-label="Colour rules"
              title="Colour rules the replica must follow"
              className="mm-field rounded-lg px-3 py-2 text-sm text-[#F2EEE6]"
            >
              {Object.entries(SYSTEM_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v} rules
                </option>
              ))}
            </select>
          </div>
          <div className="mt-auto flex items-center gap-3">
            <button
              type="submit"
              disabled={!file || stage !== "idle"}
              className="mm-cta flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-[#F7F3EC] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {stage === "uploading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                </>
              ) : stage === "reading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading the design…
                </>
              ) : stage === "done" ? (
                <>
                  <Check className="h-4 w-4" /> Added, waiting for approval
                </>
              ) : (
                <>
                  <ImagePlus className="h-4 w-4" /> Add template
                </>
              )}
            </button>
            {error && <span className="text-[11px] text-red-300">{error}</span>}
          </div>
        </div>
      </div>
    </form>
  );
}
