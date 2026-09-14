"use client";

// The composer sheet: a centred dialog over a blurred Studio with a three-step
// segmented indicator (Template · Details · Questions) whose highlight slides.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";

export type ComposerStep = "template" | "details";

const STEPS = ["Template", "Details", "Questions"] as const;

function Steps({ index }: { index: number }) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  const measure = () => {
    const el = refs.current[index];
    if (!el) return;
    setPill({ x: el.offsetLeft, w: el.offsetWidth });
  };
  useLayoutEffect(measure, [index]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <div className="relative flex items-center gap-0.5 rounded-full bg-[rgba(242,238,230,0.05)] p-1" aria-label="Steps">
      {pill && (
        <span
          aria-hidden
          className="absolute left-0 top-1 h-7 rounded-full bg-[#F2EEE6] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.6)]"
          style={{
            width: pill.w,
            transform: `translateX(${pill.x}px)`,
            transition: "transform 0.38s cubic-bezier(0.22, 1, 0.36, 1), width 0.38s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      )}
      {STEPS.map((label, i) => (
        <span
          key={label}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-current={i === index ? "step" : undefined}
          className={`relative z-10 flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium uppercase tracking-[0.14em] transition-colors duration-300 ${
            i === index ? "text-[#1C1A18]" : i < index ? "text-[#F2EEE6]" : "text-[#8C8278]"
          }`}
        >
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{i + 1}</span>
        </span>
      ))}
    </div>
  );
}

export function ComposerFrame({
  step,
  briefStep,
  title = "New design",
  onBack,
  onClose,
  children,
}: {
  step: ComposerStep;
  briefStep: "base" | "followup";
  title?: string;
  onBack: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const index = step === "template" ? 0 : briefStep === "followup" ? 2 : 1;
  return (
    <>
      <div className="mm-backdrop-in fixed inset-0 z-40 bg-black/55 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="mm-modal-in mm-sheet fixed inset-x-3 top-[4svh] z-50 mx-auto flex max-h-[92svh] flex-col overflow-hidden rounded-2xl sm:inset-x-6 lg:max-w-[960px]"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[rgba(242,238,230,0.06)] px-3 sm:px-4">
          <div className="flex w-28 items-center">
            {step !== "template" ? (
              <button type="button" onClick={onBack} className="mm-ghost -ml-1">
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            ) : (
              <span className="pl-2 text-[13px] text-[#CFC8BD]">{title}</span>
            )}
          </div>
          <Steps index={index} />
          <div className="flex w-28 justify-end">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="mm-ghost h-9 w-9 justify-center rounded-full px-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </>
  );
}
