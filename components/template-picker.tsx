"use client";

// Templates: the approved reference designs GMs create from.
//  - mode="pick"   → grid of APPROVED templates, click to choose (composer step 1).
//  - mode="manage" → marketing/admin view: upload a reference, approve / reject /
//                    delete, grouped by status. Everything is gated server-side too.
import { useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Check, ImagePlus, Loader2, Trash2, X, Sparkles } from "lucide-react";

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

export function TemplatePicker({
  mode,
  onPick,
  selectedId,
}: {
  mode: "pick" | "manage";
  onPick?: (t: TemplateCard) => void;
  selectedId?: Id<"templates"> | null;
}) {
  const data = useQuery(api.templates.listTemplates);
  const approve = useMutation(api.templates.approveTemplate);
  const reject = useMutation(api.templates.rejectTemplate);
  const remove = useMutation(api.templates.deleteTemplate);
  const [busy, setBusy] = useState<string | null>(null);

  const templates = (data?.templates ?? []) as TemplateCard[];
  const canManage = data?.canManage ?? false;
  const approved = useMemo(() => templates.filter((t) => t.status === "approved"), [templates]);
  const pending = useMemo(() => templates.filter((t) => t.status === "pending"), [templates]);
  const rejected = useMemo(() => templates.filter((t) => t.status === "rejected"), [templates]);

  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-[#8C8278]">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#CC7A5C]" /> Loading templates…
      </div>
    );
  }

  const act = async (id: Id<"templates">, fn: () => Promise<unknown>) => {
    setBusy(id);
    try { await fn(); } finally { setBusy(null); }
  };

  const Card = ({ t, i }: { t: TemplateCard; i: number }) => {
    const selected = selectedId === t._id;
    const pickable = mode === "pick";
    return (
      <div
        className="mm-fade-up group relative"
        style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
      >
        <button
          type="button"
          onClick={() => pickable && onPick?.(t)}
          className={`block w-full overflow-hidden rounded-xl border text-left transition-all duration-300 ease-out ${
            pickable ? "cursor-pointer hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)]" : "cursor-default"
          } ${
            selected
              ? "border-[#CC7A5C] ring-2 ring-[#CC7A5C]/40"
              : "border-[rgba(242,238,230,0.08)] hover:border-[rgba(242,238,230,0.25)]"
          }`}
        >
          <div className={`${ASPECT[t.format] ?? "aspect-square"} w-full overflow-hidden bg-[#242220]`}>
            {t.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={t.imageUrl}
                alt={t.name}
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-[#8C8278]/50">
                <ImagePlus className="h-5 w-5" />
              </div>
            )}
          </div>
          <div className="space-y-1 px-3 py-2.5">
            <p className="truncate text-[12px] font-medium text-[#F2EEE6]">{t.name}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-[rgba(242,238,230,0.1)] px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-[#8C8278]">
                {FORMAT_LABEL[t.format] ?? t.format}
              </span>
              <span className="rounded-full border border-[rgba(242,238,230,0.1)] px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-[#8C8278]">
                {SYSTEM_LABEL[t.designSystem] ?? t.designSystem}
              </span>
              {mode === "manage" && t.status !== "approved" && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${
                  t.status === "pending" ? "bg-[#FFC72C]/15 text-[#FFC72C]" : "bg-red-500/15 text-red-300"
                }`}>
                  {t.status}
                </span>
              )}
            </div>
          </div>
        </button>
        {selected && (
          <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[#CC7A5C] text-[#1C1A18] shadow">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
        {mode === "manage" && canManage && (
          <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {t.status !== "approved" && (
              <button
                type="button"
                title="Approve — GMs can use it"
                disabled={busy === t._id}
                onClick={() => act(t._id, () => approve({ templateId: t._id }))}
                className="grid h-7 w-7 cursor-pointer place-items-center rounded-md bg-[#1C1A18]/90 text-emerald-300 backdrop-blur hover:bg-emerald-500/20"
              >
                {busy === t._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
            )}
            {t.status === "approved" && (
              <button
                type="button"
                title="Retire — hide from GMs"
                disabled={busy === t._id}
                onClick={() => act(t._id, () => reject({ templateId: t._id }))}
                className="grid h-7 w-7 cursor-pointer place-items-center rounded-md bg-[#1C1A18]/90 text-[#CFC8BD] backdrop-blur hover:bg-[#FFC72C]/20 hover:text-[#FFC72C]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              title="Delete"
              disabled={busy === t._id}
              onClick={() => { if (confirm(`Delete "${t.name}"?`)) void act(t._id, () => remove({ templateId: t._id })); }}
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-md bg-[#1C1A18]/90 text-[#8C8278] backdrop-blur hover:bg-red-500/20 hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const Grid = ({ items, offset = 0 }: { items: TemplateCard[]; offset?: number }) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((t, i) => <Card key={t._id} t={t} i={i + offset} />)}
    </div>
  );

  if (mode === "pick") {
    if (approved.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-[rgba(242,238,230,0.12)] px-4 py-10 text-center">
          <Sparkles className="mx-auto h-5 w-5 text-[#CC7A5C]" />
          <p className="mt-2 text-sm text-[#F2EEE6]">No templates yet</p>
          <p className="mt-1 text-xs text-[#8C8278]">The marketing team adds and approves them. Check back soon.</p>
        </div>
      );
    }
    return <Grid items={approved} />;
  }

  return (
    <div className="space-y-8">
      {canManage && <UploadReference />}
      {pending.length > 0 && (
        <section className="space-y-3">
          <h3 className="mm-eyebrow flex items-center gap-2">
            Waiting for approval
            <span className="rounded-full bg-[#FFC72C]/15 px-1.5 text-[10px] text-[#FFC72C]">{pending.length}</span>
          </h3>
          <Grid items={pending} />
        </section>
      )}
      <section className="space-y-3">
        <h3 className="mm-eyebrow">Live for GMs · {approved.length}</h3>
        {approved.length ? <Grid items={approved} offset={pending.length} /> : (
          <p className="text-xs text-[#8C8278]">Nothing approved yet. Upload a reference above, then approve it.</p>
        )}
      </section>
      {rejected.length > 0 && (
        <section className="space-y-3">
          <h3 className="mm-eyebrow text-[#8C8278]">Retired · {rejected.length}</h3>
          <Grid items={rejected} offset={pending.length + approved.length} />
        </section>
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
        pick(null); setName(""); setStage("idle");
        if (fileRef.current) fileRef.current.value = "";
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("idle");
    }
  }

  return (
    <form onSubmit={submit} className="mm-card rounded-xl p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <label
          className={`relative grid w-full shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed transition-colors sm:w-44 ${ASPECT[format] ?? "aspect-square"} ${
            preview ? "border-transparent" : "border-[rgba(242,238,230,0.2)] hover:border-[#CC7A5C]/60"
          }`}
        >
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1.5 px-3 text-center text-[11px] text-[#8C8278]">
              <ImagePlus className="h-5 w-5 text-[#CC7A5C]" />
              Drop a reference design
            </span>
          )}
        </label>
        <div className="flex flex-1 flex-col gap-2.5">
          <p className="text-[11px] font-medium text-[#CFC8BD]">Add a template</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name — “Neon party poster”" className="mm-field w-full rounded-lg px-3 py-2 text-sm text-[#F2EEE6] placeholder:text-[#8C8278]/55" />
          <div className="grid grid-cols-2 gap-2">
            <select value={format} onChange={(e) => setFormat(e.target.value)} className="mm-field rounded-lg px-3 py-2 text-sm text-[#F2EEE6]">
              {Object.entries(FORMAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v} · {k}</option>)}
            </select>
            <select value={designSystem} onChange={(e) => setDesignSystem(e.target.value)} className="mm-field rounded-lg px-3 py-2 text-sm text-[#F2EEE6]">
              {Object.entries(SYSTEM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="mt-auto flex items-center gap-3">
            <button type="submit" disabled={!file || stage !== "idle"} className="mm-cta flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-[#F7F3EC] disabled:cursor-not-allowed disabled:opacity-40">
              {stage === "uploading" ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                : stage === "reading" ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading the design…</>
                : stage === "done" ? <><Check className="h-4 w-4" /> Added, waiting for approval</>
                : <><ImagePlus className="h-4 w-4" /> Add template</>}
            </button>
            {error && <span className="text-[11px] text-red-300">{error}</span>}
          </div>
        </div>
      </div>
    </form>
  );
}
