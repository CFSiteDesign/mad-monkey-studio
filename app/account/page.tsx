"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BrandLogo } from "@/components/brand-logo";
import { PoweredBy } from "@/components/powered-by";
import { AdminMembers } from "@/components/admin-members";
import {
  ArrowLeft,
  Images,
  Coins,
  Wallet,
  Loader2,
} from "lucide-react";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export default function AccountPage() {
  const stats = useQuery(api.usage.myStats);

  // Loading
  if (stats === undefined) {
    return (
      <div className="mm-ambient grid min-h-screen place-items-center">
        <div className="flex items-center gap-2 text-sm text-[#8C8278]">
          <Loader2 className="h-4 w-4 animate-spin text-[#CC7A5C]" />
          Loading your stats…
        </div>
      </div>
    );
  }

  // Signed out
  if (stats === null) {
    return (
      <div className="mm-ambient grid min-h-screen place-items-center">
        <div className="mm-card rounded-xl p-8 text-center">
          <p className="text-sm text-[#F2EEE6]">You&apos;re signed out.</p>
          <Link
            href="/sign-in"
            className="mt-3 inline-block text-sm text-[#CC7A5C] hover:text-[#E0936F] underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const cap = stats.capUsd;
  const spent = stats.month.spendUsd;
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  const remaining = Math.max(0, cap - spent);
  const monthTokens = stats.month.inputTokens + stats.month.outputTokens;

  // Bar colour: terracotta → amber at 80% → red at 95%
  const barColor =
    pct >= 95 ? "#EF4444" : pct >= 80 ? "#F59E0B" : "#CC7A5C";

  const monthLabel = new Date(stats.periodMonth + "-01").toLocaleDateString(
    "en-GB",
    { month: "long", year: "numeric" },
  );

  return (
    <div className="mm-ambient mm-grain relative min-h-screen overflow-y-auto">
      {/* ── Header ── */}
      <header className="z-20 flex items-center justify-between gap-2 border-b border-[rgba(242,238,230,0.08)] bg-[#1C1A18]/70 px-4 py-3.5 backdrop-blur-md lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo className="h-8 w-auto" />
          <span className="hidden h-6 w-px bg-[rgba(242,238,230,0.12)] sm:block" />
          <p
            className="truncate text-lg font-light leading-none text-[#F2EEE6]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Account
          </p>
        </div>
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-2 text-sm text-[#8C8278] transition-colors hover:text-[#F2EEE6] lg:px-3"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to Studio</span>
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl space-y-6 px-4 py-6 lg:px-6 lg:py-10">
        {/* ── Who ── */}
        <div className="mm-fade-up">
          <p className="mm-eyebrow">Signed in as</p>
          <div className="mt-1 flex items-baseline gap-3">
            <h1
              className="text-2xl font-light text-[#F2EEE6]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {stats.name}
            </h1>
            <span className="rounded-full border border-[rgba(242,238,230,0.1)] px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-[#8C8278]">
              {stats.role}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-[#8C8278]">{stats.email}</p>
        </div>

        {/* ── Spend vs cap ── */}
        <section className="mm-card mm-fade-up rounded-xl p-4 lg:p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Wallet className="h-4 w-4 shrink-0 text-[#CC7A5C]" />
              <h2 className="text-sm font-medium text-[#F2EEE6]">
                Spend — {monthLabel}
              </h2>
            </div>
            <p className="text-xs text-[#8C8278]">
              resets on the 1st
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className="text-4xl font-light text-[#F2EEE6]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              ${spent.toFixed(2)}
            </span>
            <span className="text-sm text-[#8C8278]">
              of ${cap.toFixed(0)} monthly limit
            </span>
          </div>

          {/* Progress bar */}
          <div
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-[rgba(242,238,230,0.07)]"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Monthly spend against limit"
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: barColor }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-[#8C8278]">
            <span>{pct.toFixed(1)}% used</span>
            <span>${remaining.toFixed(2)} remaining</span>
          </div>
        </section>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section className="mm-card mm-fade-up rounded-xl p-4 lg:p-6">
            <div className="flex items-center gap-2.5">
              <Images className="h-4 w-4 text-[#CC7A5C]" />
              <h2 className="text-sm font-medium text-[#F2EEE6]">Media created</h2>
            </div>
            <p
              className="mt-4 text-4xl font-light text-[#F2EEE6]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {stats.month.generations}
            </p>
            <p className="mt-1 text-xs text-[#8C8278]">
              this month · {stats.allTime.generations} all time
            </p>
          </section>

          <section className="mm-card mm-fade-up rounded-xl p-4 lg:p-6">
            <div className="flex items-center gap-2.5">
              <Coins className="h-4 w-4 text-[#CC7A5C]" />
              <h2 className="text-sm font-medium text-[#F2EEE6]">Tokens used</h2>
            </div>
            <p
              className="mt-4 text-4xl font-light text-[#F2EEE6]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {fmtTokens(monthTokens)}
            </p>
            <p className="mt-1 text-xs text-[#8C8278]">
              this month · {fmtTokens(stats.month.inputTokens)} in /{" "}
              {fmtTokens(stats.month.outputTokens)} out ·{" "}
              {fmtTokens(stats.allTime.tokens)} all time
            </p>
          </section>
        </div>

        {/* ── Recent generations ── */}
        <section className="mm-card mm-fade-up rounded-xl p-4 lg:p-6">
          <h2 className="text-sm font-medium text-[#F2EEE6]">Recent generations</h2>
          {stats.recent.length === 0 ? (
            <p className="mt-4 text-sm text-[#8C8278]">
              Nothing yet — your first generation will show up here.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[rgba(242,238,230,0.06)]">
              {stats.recent.map((g) => (
                <li
                  key={g.id}
                  className="flex flex-col gap-1.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="rounded-md border border-[rgba(242,238,230,0.1)] px-2 py-0.5 font-mono text-[11px] text-[#CFC8BD]">
                      {g.format}
                    </span>
                    <span className="capitalize text-[#F2EEE6]">
                      {g.designSystem}
                    </span>
                    {g.status === "failed" ? (
                      <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300">
                        Failed
                      </span>
                    ) : (
                      <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300/80">
                        Done
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 font-mono text-[11px] text-[#8C8278]">
                    <span>{fmtTokens(g.tokens)} tok</span>
                    <span>${g.costUsd.toFixed(4)}</span>
                    <span>{fmtDate(g.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Members (admins only) ── */}
        {stats.role === "admin" && <AdminMembers />}
      </main>

      <div className="pointer-events-none fixed bottom-4 right-5 z-20 opacity-60">
        <PoweredBy />
      </div>
    </div>
  );
}
