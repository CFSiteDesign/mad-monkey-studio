"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { Montserrat } from "next/font/google";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["600", "900"] });

/** Rotating status lines — shouty display voice, 2–4 words. */
const LINES = [
  "WAKING THE MONKEY",
  "FINDING THE VIBE",
  "CRANKING THE COLOUR",
  "HARDENING THE SHADOWS",
  "MAKING IT LOUDER",
  "ZERO CORPORATE ALLOWED",
  "STICKERS ON STICKERS",
  "GOING ALL IN",
];

/** Pop colours cycled with the lines (canonical poster palette). */
const POPS = ["#ffc000", "#0081f7", "#ff01aa", "#ccff01", "#00fef3", "#ff6600"];

/** Even 12-spike starburst polygon — matches the generated brand device. */
function starPoints(spikes: number, c: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    pts.push(`${(c + r * Math.cos(a)).toFixed(1)},${(c + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

const STAR = starPoints(12, 110, 102, 68);

export function GenerationLoader({
  system,
  format,
}: {
  system: string;
  format: string;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % LINES.length), 1700);
    return () => clearInterval(t);
  }, []);

  const pop = POPS[idx % POPS.length];

  return (
    <div
      className={`${montserrat.className} relative z-10 -rotate-1`}
      role="status"
      aria-live="polite"
    >
      {/* Poster card — Bone base, thick border, hard offset shadow in the live pop colour */}
      <div
        className="flex flex-col items-center gap-5 border-4 border-[#0a0a0a] bg-[#f5efe2] px-10 py-9 transition-shadow duration-300"
        style={{ boxShadow: `12px 12px 0 0 ${pop}` }}
      >
        {/* Spinning starburst with the ALL IN sticker riding on top */}
        <div className="relative h-[220px] w-[220px]">
          <svg
            viewBox="0 0 220 220"
            className="mm-spin-slow absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {/* hard shadow copy — offset, zero blur */}
            <polygon points={STAR} fill="#0a0a0a" transform="translate(7 7)" />
            <polygon
              points={STAR}
              fill={pop}
              stroke="#0a0a0a"
              strokeWidth="5"
              style={{ transition: "fill 300ms" }}
            />
          </svg>
          {/* Centred in the starburst via grid; wobble only rotates, never shifts */}
          <div className="absolute inset-0 grid place-items-center">
            <img src="/mm-allin.png" alt="" className="mm-wobble w-[104px]" />
          </div>
        </div>

        {/* Stamped rotating line — key re-triggers the stamp animation */}
        <div className="flex h-9 items-center">
          <span
            key={idx}
            className="mm-stamp whitespace-nowrap text-2xl font-black uppercase tracking-tight text-[#0a0a0a]"
            style={{ textShadow: `3px 3px 0 ${pop}` }}
          >
            {LINES[idx]}
          </span>
        </div>

        {/* Striped ticker bar — hard edges, scrolling */}
        <div
          className="mm-stripe-bar h-4 w-64 border-[3px] border-[#0a0a0a]"
          style={{ "--stripe": pop } as React.CSSProperties}
        />

        {/* Warmth lives in the lowercase */}
        <p className="text-sm font-semibold text-[#0a0a0a]/60">
          making your {system} {format} asset — hold tight, this slaps
        </p>
      </div>
    </div>
  );
}
