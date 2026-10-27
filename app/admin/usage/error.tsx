"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";

// Route-level error boundary: if the usage query fails (e.g. the backend query
// hasn't been deployed to this environment yet), show a friendly message
// instead of crashing the whole page.
export default function UsageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mm-ambient grid min-h-[100svh] place-items-center px-6 text-center">
      <div className="mm-card max-w-md rounded-xl p-8">
        <p className="text-base font-medium text-[#15110E]">Couldn&apos;t load the usage dashboard</p>
        <p className="mt-2 text-sm leading-relaxed text-[#5E564F]">
          The data couldn&apos;t be fetched. If this is the live site, the dashboard&apos;s backend query may not be
          deployed yet — run <code className="rounded bg-[rgba(21,17,14,0.08)] px-1.5 py-0.5 text-[12px] text-[#3A332D]">npx convex deploy</code> and try again.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={reset}
            className="mm-cta flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-[#F7F3EC]"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border border-[rgba(21,17,14,0.12)] px-4 py-2 text-sm text-[#3A332D] transition-colors hover:text-[#15110E]"
          >
            <ArrowLeft className="h-4 w-4" /> Studio
          </Link>
        </div>
      </div>
    </div>
  );
}
