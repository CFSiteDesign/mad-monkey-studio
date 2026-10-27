"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { LOOKS, LOOK_GROUPS, type Look } from "@/lib/looks";

/** One look: a real example poster that flips through its examples on hover
 *  or keyboard focus, so people see the look before they pick it. */
export function LookCard({
  look,
  active,
  onSelect,
  compact = false,
}: {
  look: Look;
  active: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [i, setI] = useState(0);
  // Phones have no hover: there the examples flip on their own, slowly and
  // out of step with each other.
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia("(hover: none)").matches);
  }, []);

  useEffect(() => {
    const n = look.examples.length;
    if (touch) {
      let t: ReturnType<typeof setInterval> | undefined;
      const start = setTimeout(() => {
        setI((v) => (v + 1) % n);
        t = setInterval(() => setI((v) => (v + 1) % n), 2600);
      }, 1200 + ((look.name.length * 337) % 1800));
      return () => {
        clearTimeout(start);
        if (t) clearInterval(t);
      };
    }
    if (!hover) {
      setI(0);
      return;
    }
    setI(1 % n);
    const t = setInterval(() => setI((v) => (v + 1) % n), 1100);
    return () => clearInterval(t);
  }, [hover, touch, look.examples.length, look.name]);

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-pressed={active}
      aria-label={`${look.label}: ${look.desc}`}
      className={`group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white text-left transition-all duration-200 ${
        active
          ? "border-[#D2452B] shadow-[0_0_0_2px_#D2452B,0_14px_30px_-18px_rgba(210,69,43,0.6)]"
          : "border-[#E4DCCF] hover:-translate-y-0.5 hover:border-[#CFC4B4] hover:shadow-[0_14px_30px_-20px_rgba(21,17,14,0.35)]"
      }`}
    >
      <span className={`relative block w-full overflow-hidden bg-[#EFE9DF] ${compact ? "aspect-[4/5]" : "aspect-[4/5]"}`}>
        {look.examples.map((e, n) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={e.src}
            src={e.src}
            alt={n === 0 ? `${look.label} example` : ""}
            width={e.w}
            height={e.h}
            loading={n === 0 ? "eager" : "lazy"}
            // Portrait posters fill the tile; a landscape one is shown whole
            // (cropping it to portrait would cut its headline off).
            className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${
              e.w > e.h ? "object-contain p-2" : "object-cover"
            } ${n === i ? "opacity-100" : "opacity-0"}`}
          />
        ))}
        {/* Which example is showing */}
        <span
          className={`absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-[#15110E]/55 px-1.5 py-1 transition-opacity ${
            hover ? "opacity-100" : "opacity-0"
          }`}
        >
          {look.examples.map((e, n) => (
            <span
              key={e.src}
              className={`h-1.5 w-1.5 rounded-full ${n === i ? "bg-[#E8553A]" : "bg-[#F7F3EC]/60"}`}
            />
          ))}
        </span>
        {active && (
          <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[#D2452B] text-white shadow">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        )}
      </span>
      <span className={`block ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}>
        <span className="block text-[13px] font-semibold leading-tight text-[#15110E]">{look.label}</span>
        {!compact && (
          <span className="mt-0.5 block text-[11.5px] leading-snug text-[#5E564F]">{look.desc}</span>
        )}
      </span>
    </button>
  );
}

/** Every look, grouped, as a grid of example cards. */
export function LookPicker({
  value,
  onChange,
  className = "",
  cols = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
}: {
  value: string;
  onChange: (name: string) => void;
  className?: string;
  cols?: string;
}) {
  return (
    <div className={`space-y-7 ${className}`}>
      {LOOK_GROUPS.map((g) => (
        <section key={g.id} className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="mm-eyebrow">{g.title}</h3>
            <p className="text-[12px] text-[#5E564F]">{g.note}</p>
          </div>
          <div className={`grid gap-3 ${cols}`}>
            {LOOKS.filter((l) => l.group === g.id).map((look) => (
              <LookCard
                key={look.name}
                look={look}
                active={value === look.name}
                onSelect={() => onChange(look.name)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The picker in a sheet, opened from the form's "Look" field. */
export function LookPickerModal({
  open,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  value: string;
  onChange: (name: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#15110E]/45 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pick a look"
    >
      <div
        className="mm-fade-up max-h-[92svh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-[#F7F3EC] p-5 shadow-2xl sm:rounded-3xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="mm-display text-[32px] sm:text-[40px]">
              Pick a look<span className="text-[#E8553A]">.</span>
            </h2>
            <p className="mt-2 text-sm text-[#5E564F]">Every card shows real examples of the look.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border border-[#E4DCCF] bg-white text-[#15110E] transition-colors hover:bg-[#EFE9DF]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <LookPicker
          value={value}
          onChange={(n) => {
            onChange(n);
            onClose();
          }}
          cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
        />
      </div>
    </div>
  );
}
