"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarChart3, Images, LogOut, Wallet } from "lucide-react";

export function SignOutButton({
  initials,
  email,
  role,
}: {
  initials: string;
  email?: string;
  role?: string;
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
        className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-b from-[#D2452B] to-[#B83A22] text-xs font-medium text-[#F7F3EC] ring-1 ring-[rgba(21,17,14,0.16)] transition-transform hover:scale-105 cursor-pointer lg:h-9 lg:w-9"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="mm-card absolute right-0 top-11 z-50 w-56 max-w-[calc(100vw-1.5rem)] rounded-xl p-1.5 mm-fade-up"
        >
          {email && (
            <div className="px-3 py-2.5 border-b border-[rgba(21,17,14,0.08)] mb-1">
              <p className="mm-eyebrow">Signed in as</p>
              <p className="truncate text-sm text-[#15110E] mt-0.5">{email}</p>
            </div>
          )}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push("/account");
            }}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[#15110E] hover:bg-[rgba(21,17,14,0.05)] transition-colors cursor-pointer lg:min-h-0 lg:py-2"
          >
            <BarChart3 className="h-4 w-4 text-[#5E564F]" />
            My account
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push("/bank");
            }}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[#15110E] hover:bg-[rgba(21,17,14,0.05)] transition-colors cursor-pointer lg:min-h-0 lg:py-2"
          >
            <Images className="h-4 w-4 text-[#5E564F]" />
            Image bank
          </button>
          {role === "admin" && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                router.push("/admin/usage");
              }}
              className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[#15110E] hover:bg-[rgba(21,17,14,0.05)] transition-colors cursor-pointer lg:min-h-0 lg:py-2"
            >
              <Wallet className="h-4 w-4 text-[#5E564F]" />
              Usage dashboard
              <span className="ml-auto rounded-full border border-[rgba(21,17,14,0.1)] px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-[#5E564F]">
                admin
              </span>
            </button>
          )}
          <button
            role="menuitem"
            onClick={async () => {
              await signOut();
              router.push("/sign-in");
            }}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[#15110E] hover:bg-[rgba(21,17,14,0.05)] transition-colors cursor-pointer lg:min-h-0 lg:py-2"
          >
            <LogOut className="h-4 w-4 text-[#5E564F]" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
