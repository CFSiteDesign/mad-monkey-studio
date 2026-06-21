"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarChart3, Images, LogOut } from "lucide-react";

export function SignOutButton({
  initials,
  email,
}: {
  initials: string;
  email?: string;
}) {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        data-tour="account-menu"
        className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-b from-[#D4866A] to-[#C06F51] text-xs font-medium text-[#F7F3EC] ring-1 ring-[rgba(242,238,230,0.16)] transition-transform hover:scale-105 cursor-pointer lg:h-9 lg:w-9"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="mm-card absolute right-0 top-11 z-50 w-56 max-w-[calc(100vw-1.5rem)] rounded-xl p-1.5 mm-fade-up"
        >
          {email && (
            <div className="px-3 py-2.5 border-b border-[rgba(242,238,230,0.08)] mb-1">
              <p className="mm-eyebrow">Signed in as</p>
              <p className="truncate text-sm text-[#F2EEE6] mt-0.5">{email}</p>
            </div>
          )}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push("/account");
            }}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[#F2EEE6] hover:bg-[rgba(242,238,230,0.05)] transition-colors cursor-pointer lg:min-h-0 lg:py-2"
          >
            <BarChart3 className="h-4 w-4 text-[#8C8278]" />
            My account
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push("/bank");
            }}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[#F2EEE6] hover:bg-[rgba(242,238,230,0.05)] transition-colors cursor-pointer lg:min-h-0 lg:py-2"
          >
            <Images className="h-4 w-4 text-[#8C8278]" />
            Image bank
          </button>
          <button
            role="menuitem"
            onClick={async () => {
              await signOut();
              router.push("/sign-in");
            }}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[#F2EEE6] hover:bg-[rgba(242,238,230,0.05)] transition-colors cursor-pointer lg:min-h-0 lg:py-2"
          >
            <LogOut className="h-4 w-4 text-[#8C8278]" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
