"use client";

// Local design playground (dev only, 404 in production): the Studio shell,
// the empty canvas and the composer sheet with mock templates, so the UI can
// be looked at without signing in. Images come from public/dev-templates/
// (gitignored; copy a few cropped posters in).
import { useState } from "react";
import { notFound } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { StudioHeader } from "@/components/studio-header";
import { ComposerFrame } from "@/components/composer-frame";
import { TemplatePicker, type TemplateCard } from "@/components/template-picker";
import { Plus } from "lucide-react";

const NAMES: [string, string][] = [
  ["y2k-kawaii", "Y2K kawaii"],
  ["zine-riot", "Zine riot"],
  ["minimalist", "Minimalist"],
  ["swiss-mask", "Swiss mask"],
  ["pop-art-brutalism", "Pop art brutalism"],
  ["90s-athletic", "90s athletic"],
  ["maximalist-flyer", "Maximalist flyer"],
  ["industrial-techno", "Industrial techno"],
];
const MOCK: TemplateCard[] = NAMES.map(([slug, name], i) => ({
  _id: `mock-${i}` as unknown as Id<"templates">,
  name,
  description: name,
  format: "4:5",
  designSystem: "brand",
  status: "approved",
  imageUrl: `/dev-templates/${slug}.jpg`,
}));

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"template" | "details">("template");
  const [picked, setPicked] = useState<Id<"templates"> | null>(null);

  return (
    <div className="mm-ambient relative flex h-screen flex-col overflow-hidden">
      <StudioHeader
        user={{ email: "gm@madmonkeyhostels.com", role: "user" }}
        initials="GM"
        onHome={() => setOpen(false)}
        onCreate={() => {
          setStep("template");
          setOpen(true);
        }}
        onOpenGallery={() => {}}
        onTour={() => {}}
      />
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-[rgba(242,238,230,0.08)] bg-[#1C1A18]/60 dt:flex xl:w-64">
          <p className="mm-eyebrow px-4 pb-1 pt-3.5">Gallery</p>
          <p className="px-4 py-2 text-xs leading-relaxed text-[#8C8278]/70">Nothing here yet.</p>
        </aside>
        <main
          className="relative flex flex-1 flex-col overflow-y-auto bg-[#18160F] p-6 xl:p-8"
          style={{
            backgroundImage:
              "linear-gradient(rgba(242,238,230,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(242,238,230,0.04) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        >
          <div className="m-auto flex w-full max-w-3xl flex-col items-center gap-7 py-6 text-center">
            <div className="mm-fade-up space-y-2.5">
              <p
                className="text-[34px] font-light leading-[1.1] tracking-tight text-[#F2EEE6] sm:text-[42px]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                What are we making today?
              </p>
              <p className="text-[14px] text-[#8C8278]">Pick a template, add your event, and the design lands here.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mm-cta mm-fade-up flex h-11 cursor-pointer items-center gap-2 rounded-full pl-4 pr-5 text-sm font-medium text-[#F7F3EC]"
              style={{ animationDelay: "70ms" }}
            >
              <Plus className="h-4 w-4" /> Create
            </button>
            <div className="mm-fade-up mt-2 w-full text-left" style={{ animationDelay: "140ms" }}>
              <p className="mm-eyebrow mb-3">Start from a template</p>
              <TemplatePicker
                mode="pick"
                limit={8}
                templates={MOCK}
                onPick={(t) => {
                  setPicked(t._id);
                  setStep("details");
                  setOpen(true);
                }}
              />
            </div>
          </div>
        </main>
      </div>

      {open && (
        <ComposerFrame step={step} briefStep="base" onBack={() => setStep("template")} onClose={() => setOpen(false)}>
          {step === "template" ? (
            <div className="mm-step-in min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-[22px] font-light tracking-tight text-[#F2EEE6]" style={{ fontFamily: "var(--font-display)" }}>
                    Pick a template
                  </h2>
                  <p className="mt-1 text-[13px] text-[#8C8278]">Your design keeps this look. You add the event.</p>
                </div>
              </div>
              <div className="mt-6">
                <TemplatePicker
                  mode="pick"
                  templates={MOCK}
                  selectedId={picked}
                  onPick={(t) => {
                    setPicked(t._id);
                    setStep("details");
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="mm-step-in flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-10 lg:px-24">
                <div className="flex items-center gap-3 rounded-xl border border-[#CC7A5C]/30 bg-[#CC7A5C]/5 p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={MOCK.find((m) => m._id === picked)?.imageUrl ?? MOCK[0].imageUrl!} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="mm-eyebrow">Template</p>
                    <p className="truncate text-sm text-[#F2EEE6]">{MOCK.find((m) => m._id === picked)?.name ?? MOCK[0].name}</p>
                  </div>
                  <button type="button" onClick={() => setStep("template")} className="mm-ghost">
                    Change
                  </button>
                </div>
                <p className="mt-8 text-[13px] text-[#8C8278]">The live event form renders here in Studio.</p>
              </div>
              <div className="flex shrink-0 flex-row-reverse items-center gap-3 border-t border-[rgba(242,238,230,0.06)] px-5 py-4 sm:px-10 lg:px-24">
                <button type="button" className="mm-cta flex min-w-[200px] cursor-pointer items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-[#F7F3EC]">
                  Continue
                </button>
                <span className="flex-1 text-left text-[11px] text-[#8C8278]">skip the extra questions →</span>
              </div>
            </div>
          )}
        </ComposerFrame>
      )}
    </div>
  );
}
