"use client";

// The Studio top bar. Quiet ghost links, one accent action (Create), avatar.
// Pages other than the Studio pass `title` + `backHref` and get a minimal bar.
import Link from "next/link";
import { ArrowLeft, HelpCircle, LayoutTemplate, Menu, MessageSquare, Plus } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { SignOutButton } from "@/components/sign-out-button";

const FEEDBACK_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdCGDQJTQHuj1OY3I8mAtQL7vyTAfK3Ym-gEmfQHjursAm1Vw/viewform";

export function StudioHeader({
  user,
  initials,
  title,
  backHref,
  onHome,
  onCreate,
  onOpenGallery,
  onTour,
  createDisabled,
}: {
  user?: { email?: string; role?: string } | null;
  initials?: string;
  title?: string;
  backHref?: string;
  onHome?: () => void;
  onCreate?: () => void;
  onOpenGallery?: () => void;
  onTour?: () => void;
  createDisabled?: boolean;
}) {
  const brand = (
    <>
      <BrandLogo className="h-7 w-auto shrink-0" />
      <span
        className="hidden text-[15px] font-light tracking-tight text-[#F2EEE6] sm:inline"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Studio
      </span>
    </>
  );

  return (
    <header className="mm-glass z-20 flex h-14 shrink-0 items-center justify-between gap-3 px-3 sm:px-5 lg:px-6">
      <div className="flex min-w-0 items-center gap-1.5">
        {onOpenGallery && (
          <button
            type="button"
            onClick={onOpenGallery}
            aria-label="Open gallery"
            className="mm-ghost h-9 w-9 justify-center px-0 dt:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        {onHome ? (
          <button
            type="button"
            onClick={onHome}
            title="Home"
            className="-ml-1.5 flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors duration-200 hover:bg-[rgba(242,238,230,0.05)]"
          >
            {brand}
          </button>
        ) : (
          <Link href="/" className="-ml-1.5 flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors duration-200 hover:bg-[rgba(242,238,230,0.05)]">
            {brand}
          </Link>
        )}
        {title && (
          <>
            <span className="mx-1 h-5 w-px bg-[rgba(242,238,230,0.12)]" />
            <span className="truncate text-[13px] text-[#CFC8BD]">{title}</span>
          </>
        )}
      </div>

      <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        {backHref ? (
          <Link href={backHref} className="mm-ghost">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Studio</span>
          </Link>
        ) : (
          <>
            <Link href="/templates" className="mm-ghost" title="Templates">
              <LayoutTemplate className="h-4 w-4" />
              <span className="hidden sm:inline">Templates</span>
            </Link>
            <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="mm-ghost" title="Share feedback">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Feedback</span>
            </a>
            {onTour && (
              <button type="button" onClick={onTour} className="mm-ghost" title="Take the tour">
                <HelpCircle className="h-4 w-4" />
                <span className="hidden sm:inline">How it works</span>
              </button>
            )}
            {onCreate && (
              <button
                type="button"
                onClick={onCreate}
                disabled={createDisabled}
                className="mm-cta ml-1 flex h-9 cursor-pointer items-center gap-1.5 rounded-full pl-3 pr-4 text-[13px] font-medium text-[#F7F3EC] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                Create
              </button>
            )}
          </>
        )}
        <div className="ml-1.5">
          <SignOutButton initials={initials ?? "?"} email={user?.email} role={user?.role} />
        </div>
      </nav>
    </header>
  );
}
