export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen px-6">
      <div className="w-full max-w-2xl space-y-10">

        {/* Wordmark */}
        <div className="space-y-1">
          <p className="text-xs tracking-[0.2em] uppercase text-[#CC7A5C] font-medium">
            Mad Monkey
          </p>
          <h1
            className="text-6xl font-light leading-none tracking-tight text-[#F2EEE6]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Studio
          </h1>
        </div>

        {/* Divider */}
        <div className="h-px w-16 bg-[#CC7A5C] opacity-60" />

        {/* Description */}
        <p className="text-base leading-relaxed text-[#8C8278] max-w-sm">
          AI-first design system. From brief to finished asset in minutes —
          on-brand by default, enforced not suggested.
        </p>

        {/* Status badges */}
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(242,238,230,0.08)] px-3 py-1 text-xs text-[#8C8278]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#CC7A5C]" />
            Phase 0 — Scaffold
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(242,238,230,0.08)] px-3 py-1 text-xs text-[#8C8278]">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Deployed
          </span>
        </div>

      </div>
    </div>
  );
}
