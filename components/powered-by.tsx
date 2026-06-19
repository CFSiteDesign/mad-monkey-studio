/* eslint-disable @next/next/no-img-element */

/**
 * "Powered by TheoroX" watermark — uses the real TheoroX wordmark
 * (silver "Theoro" + gradient "X" on transparent), which reads on the dark UI.
 */
export function PoweredBy({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://theorox.com/"
      target="_blank"
      rel="noopener noreferrer"
      className={`pointer-events-auto flex items-center gap-2 select-none transition-opacity hover:opacity-80 ${className}`}
      aria-label="Powered by TheoroX — visit theorox.com"
    >
      <span className="text-[9px] uppercase tracking-[0.18em] text-[#8C8278]/70">
        Powered by
      </span>
      <img
        src="/theorox-logo.png"
        alt="TheoroX"
        className="h-3.5 w-auto"
      />
    </a>
  );
}
