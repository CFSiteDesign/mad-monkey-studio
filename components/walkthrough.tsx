"use client";

// Interactive product tour. Dims the screen, spotlights one element at a time,
// and shows a tooltip card with the step's explanation. Each step can run an
// `onEnter` action that drives the page (type into fields, switch design system)
// so the tour DEMONSTRATES the flow rather than just describing it.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

export type TourStep = {
  /** CSS selector for the element to spotlight, e.g. '[data-tour="format"]'. */
  target?: string;
  title: string;
  body: React.ReactNode;
  /** Runs when the step is entered — drive demo state here. */
  onEnter?: () => void | Promise<void>;
  /** Spotlight padding around the target (px). */
  padding?: number;
};

type Box = { left: number; top: number; width: number; height: number };

export function Walkthrough({
  steps,
  open,
  onClose,
}: {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [entering, setEntering] = useState(false);

  // Refs so the effects below don't re-run on every PARENT re-render (the steps
  // array is a new reference each render). Without this, `onEnter` re-fires
  // continuously and restarts the typing demos.
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const iRef = useRef(i);
  iRef.current = i;

  const measure = useCallback(() => {
    const step = stepsRef.current[iRef.current];
    if (!step?.target) return setBox(null);
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) return setBox(null);
    const r = el.getBoundingClientRect();
    // Treat targets that are off-screen, hidden, or zero-sized as "missing" so the
    // step degrades to a centred card instead of a broken/empty spotlight. This is
    // common on mobile where targets can live inside a closed drawer or scroll out.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const visible =
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < vh &&
      r.left < vw;
    if (!visible) return setBox(null);
    const pad = step.padding ?? 8;
    setBox({ left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
  }, []);

  // Reset to first step whenever the tour opens.
  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  // Enter a step: runs ONCE per step change (i/open) — never on a re-render.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setEntering(true);
      const step = stepsRef.current[i];
      try {
        await step?.onEnter?.();
      } catch {
        /* demo action best-effort */
      }
      await new Promise((r) => setTimeout(r, 90));
      if (cancelled) return;
      if (step?.target) {
        (document.querySelector(step.target) as HTMLElement | null)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        await new Promise((r) => setTimeout(r, 300)); // let the smooth scroll settle
      }
      if (cancelled) return;
      measure();
      setEntering(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [i, open, measure]);

  // Keep the spotlight aligned on resize/scroll.
  useEffect(() => {
    if (!open) return;
    const f = () => measure();
    window.addEventListener("resize", f);
    window.addEventListener("scroll", f, true);
    return () => {
      window.removeEventListener("resize", f);
      window.removeEventListener("scroll", f, true);
    };
  }, [open, measure]);

  // Keyboard: Esc closes, arrows navigate.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI((v) => (v < stepsRef.current.length - 1 ? v + 1 : v));
      else if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  const step = steps[i];
  const last = i === steps.length - 1;

  // Place the tooltip beside the spotlight (right → left → below), else centre it.
  // On phones the card is viewport-width-bound, so we measure the real card width
  // and clamp every placement to stay fully on-screen with a small margin; if it
  // still can't sit beside the target, we fall back to a centred card.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 16;
  // Mirror the card's responsive width: min(viewport - 2rem, 340px) below `lg`.
  const cardW = Math.min(vw - margin * 2, 340);
  let cardStyle: React.CSSProperties = {};
  let centered = false;
  if (!box) {
    centered = true;
  } else {
    const gap = 16;
    let left: number | null = null;
    let top = box.top;
    if (box.left + box.width + gap + cardW <= vw - margin) {
      left = box.left + box.width + gap;
    } else if (box.left - gap - cardW >= margin) {
      left = box.left - gap - cardW;
    } else {
      // Try below/above the target, clamped horizontally within the viewport.
      const belowTop = box.top + box.height + gap;
      const fitsBelow = belowTop + 240 <= vh - margin;
      const fitsAbove = box.top - gap - 240 >= margin;
      if (fitsBelow || fitsAbove) {
        left = Math.min(Math.max(margin, box.left), vw - cardW - margin);
        top = fitsBelow ? belowTop : Math.max(margin, box.top - gap - 240);
      }
    }
    if (left === null) {
      // No room beside/above/below on a small screen → centre the card.
      centered = true;
    } else {
      top = Math.min(Math.max(margin, top), vh - 240 - margin);
      cardStyle = { left, top };
    }
  }
  if (centered) {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%,-50%)" };
  }

  const next = () => {
    if (i < steps.length - 1) setI(i + 1);
    else onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true">
      {/* click blocker (keeps the tour in control) */}
      <div className="absolute inset-0" />
      {/* dim + spotlight */}
      {box ? (
        <div
          className="absolute rounded-xl transition-all duration-300 ease-out"
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            boxShadow: "0 0 0 9999px rgba(8,7,6,0.80)",
            outline: "2px solid rgba(204,122,92,0.9)",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "rgba(8,7,6,0.86)", pointerEvents: "none" }} />
      )}
      {/* tooltip card */}
      <div
        className="absolute w-[calc(100vw-2rem)] max-w-[340px] rounded-2xl border border-[rgba(242,238,230,0.14)] bg-[#242220] p-4 shadow-2xl transition-all duration-300 lg:w-[340px] lg:max-w-none"
        style={{ ...cardStyle, opacity: entering ? 0.7 : 1 }}
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-widest text-[#CC7A5C]">
            Step {i + 1} of {steps.length}
          </span>
          <button onClick={onClose} className="-m-2 grid h-10 w-10 place-items-center text-[#8C8278] transition-colors hover:text-[#F2EEE6] lg:m-0 lg:h-auto lg:w-auto" aria-label="Close tour">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="text-sm font-semibold text-[#F2EEE6]">{step.title}</h3>
        <div className="mt-1.5 text-[12.5px] leading-relaxed text-[#CFC8BD]">{step.body}</div>
        <div className="mt-3.5 flex items-center justify-between gap-2">
          <button onClick={onClose} className="flex min-h-[40px] items-center text-[11px] text-[#8C8278] transition-colors hover:text-[#CFC8BD] lg:min-h-0">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button
                onClick={() => setI((v) => Math.max(0, v - 1))}
                className="flex min-h-[40px] items-center gap-1 rounded-lg border border-[rgba(242,238,230,0.12)] px-3 py-2 text-[11px] text-[#CFC8BD] transition-colors hover:border-[rgba(242,238,230,0.25)] lg:min-h-0 lg:px-2.5 lg:py-1.5"
              >
                <ArrowLeft className="h-3 w-3" /> Back
              </button>
            )}
            <button
              onClick={next}
              className="mm-cta flex min-h-[40px] items-center gap-1 rounded-lg px-4 py-2 text-[11px] font-medium text-[#F7F3EC] lg:min-h-0 lg:px-3 lg:py-1.5"
            >
              {last ? "Finish" : "Next"} {!last && <ArrowRight className="h-3 w-3" />}
            </button>
          </div>
        </div>
        {/* progress dots */}
        <div className="mt-3 flex justify-center gap-1">
          {steps.map((_, k) => (
            <span
              key={k}
              className={`h-1 rounded-full transition-all ${k === i ? "w-4 bg-[#CC7A5C]" : "w-1 bg-[rgba(242,238,230,0.2)]"}`}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
