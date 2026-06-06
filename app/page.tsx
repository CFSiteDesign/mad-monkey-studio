"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SignOutButton } from "@/components/sign-out-button";

export default function Home() {
  const user = useQuery(api.users.getCurrentUser);
  const brandData = useQuery(api.brands.getActiveBrandConfig, { slug: "mad-monkey" });

  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-[rgba(242,238,230,0.08)]">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] tracking-[0.2em] uppercase text-[#CC7A5C] font-medium leading-none">
              Mad Monkey
            </p>
            <p
              className="text-xl font-light text-[#F2EEE6] leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Studio
            </p>
          </div>
          {user?.role && (
            <span className="text-[10px] tracking-[0.15em] uppercase text-[#8C8278] border border-[rgba(242,238,230,0.08)] rounded-full px-2.5 py-0.5">
              {user.role}
            </span>
          )}
        </div>
        <SignOutButton initials={initials} />
      </header>

      {/* Main */}
      <main className="flex-1 px-8 py-12 max-w-2xl space-y-10">
        <div className="space-y-2">
          <h1
            className="text-5xl font-light text-[#F2EEE6]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {user ? `Hello, ${user.name?.split(" ")[0] ?? "there"}.` : "Loading…"}
          </h1>
          <p className="text-[#8C8278]">
            Phase 1 verified — Convex Auth and data are wired.
          </p>
        </div>

        <div className="h-px w-12 bg-[#CC7A5C] opacity-50" />

        {brandData ? (
          <div className="space-y-6">
            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase text-[#8C8278] mb-2">Active brand</p>
              <p className="text-[#F2EEE6] font-medium">{brandData.brand.name}</p>
              <p className="text-[#8C8278] text-sm">Config v{brandData.config.version}</p>
            </div>

            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase text-[#8C8278] mb-3">Palette</p>
              <div className="flex gap-3 flex-wrap">
                {[
                  ...brandData.config.palette.primary,
                  ...brandData.config.palette.secondary,
                  ...brandData.config.palette.neutral,
                ].map((hex) => (
                  <div key={hex} className="flex items-center gap-2">
                    <div
                      className="h-5 w-5 rounded-sm border border-[rgba(242,238,230,0.12)]"
                      style={{ backgroundColor: hex }}
                    />
                    <span className="text-[10px] text-[#8C8278] font-mono">{hex}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase text-[#8C8278] mb-2">Fonts</p>
              <p className="text-[#F2EEE6] text-sm">
                {brandData.config.fonts.display} · {brandData.config.fonts.body}
              </p>
            </div>

            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase text-[#8C8278] mb-2">Formats</p>
              <div className="flex gap-2">
                {brandData.config.formats.map((f: string) => (
                  <span
                    key={f}
                    className="text-xs text-[#8C8278] border border-[rgba(242,238,230,0.08)] rounded-full px-2.5 py-0.5"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[#8C8278]">No brand config found.</p>
            <p className="text-xs text-[#8C8278]">
              Run seed: Convex dashboard → Functions → seed → seedMadMonkey → Run
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
