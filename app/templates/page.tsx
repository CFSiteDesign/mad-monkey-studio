"use client";

// Templates — the approved reference designs the team creates from.
// GMs: browse and pick one (jumps into Studio with it selected).
// Marketing/admins: upload references, approve, retire, delete.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BrandLogo } from "@/components/brand-logo";
import { PoweredBy } from "@/components/powered-by";
import { TemplatePicker } from "@/components/template-picker";
import { ArrowLeft, LayoutTemplate } from "lucide-react";

export default function TemplatesPage() {
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const canManage = user?.role === "admin" || user?.role === "marketing";

  return (
    <div className="mm-ambient flex min-h-[100svh] flex-col">
      <header className="z-20 flex items-center justify-between gap-2 border-b border-[rgba(242,238,230,0.08)] bg-[#1C1A18]/70 px-4 py-3.5 backdrop-blur-md lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo className="h-8 w-auto" />
          <span className="hidden h-6 w-px bg-[rgba(242,238,230,0.12)] sm:block" />
          <p className="truncate text-lg font-light leading-none text-[#F2EEE6]" style={{ fontFamily: "var(--font-display)" }}>
            Templates
          </p>
        </div>
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-2 text-sm text-[#8C8278] transition-colors hover:text-[#F2EEE6] lg:px-3">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to Studio</span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-6 lg:py-8">
        <div className="mm-fade-up mb-6">
          <h1 className="flex items-center gap-2 text-xl font-light text-[#F2EEE6]" style={{ fontFamily: "var(--font-display)" }}>
            <LayoutTemplate className="h-5 w-5 text-[#CC7A5C]" />
            {canManage ? "Templates" : "Pick a template"}
          </h1>
          <p className="mt-1 text-xs text-[#8C8278]">
            {canManage
              ? "Upload a reference design, approve it, and it goes live for every GM."
              : "Choose a look, add your event details, and Studio does the rest."}
          </p>
        </div>

        {user === undefined ? (
          <p className="text-xs text-[#8C8278]">Loading…</p>
        ) : canManage ? (
          <TemplatePicker mode="manage" />
        ) : (
          <TemplatePicker mode="pick" onPick={(t) => router.push(`/?template=${t._id}`)} />
        )}
      </main>
      <PoweredBy />
    </div>
  );
}
