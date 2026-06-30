"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { sanitizeSvg } from "@/lib/sanitize-svg";
import { BrandLogo } from "@/components/brand-logo";
import { PoweredBy } from "@/components/powered-by";
import {
  ArrowLeft,
  Wallet,
  TrendingUp,
  Layers,
  Users,
  Activity,
  AlertTriangle,
  ChevronRight,
  Presentation,
  ImageOff,
  Loader2,
  X,
} from "lucide-react";

const ASPECT: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  A4: "aspect-[794/1123]",
};

/** Sanitised SVG thumbnail for a creation (renders bank photos via their URL refs). */
function SvgThumb({ code, format, className = "" }: { code: string; format?: string; className?: string }) {
  const safe = useMemo(() => (code ? sanitizeSvg(code) : ""), [code]);
  if (!safe) {
    return (
      <div className={`grid ${ASPECT[format ?? ""] ?? "aspect-square"} w-full place-items-center bg-[rgba(242,238,230,0.03)] ${className}`}>
        <ImageOff className="h-5 w-5 text-[#8C8278]/50" />
      </div>
    );
  }
  return (
    <div
      className={`${ASPECT[format ?? ""] ?? "aspect-square"} w-full overflow-hidden bg-white [&>svg]:h-full [&>svg]:w-full [&>svg]:object-cover ${className}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

function arOf(format?: string): number {
  return (
    ({ "1:1": 1, "4:5": 4 / 5, "9:16": 9 / 16, A4: 794 / 1123, presentation: 16 / 9 } as Record<string, number>)[
      format ?? ""
    ] ?? 1
  );
}

function usd(n: number, dp = 2): string {
  return `$${n.toFixed(dp)}`;
}
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}
function fmtDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function capColor(pct: number): string {
  return pct >= 95 ? "#EF4444" : pct >= 80 ? "#F59E0B" : "#CC7A5C";
}

function Metric({
  label,
  value,
  sub,
  Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  Icon: typeof Wallet;
}) {
  return (
    <div className="rounded-lg bg-[rgba(242,238,230,0.03)] p-4">
      <div className="flex items-center gap-1.5 text-[#8C8278]">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-semibold text-[#F2EEE6]">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-[#8C8278]">{sub}</p>}
    </div>
  );
}

export default function AdminUsagePage() {
  const me = useQuery(api.users.getCurrentUser);
  const isAdmin = me?.role === "admin";
  const data = useQuery(api.admin.usageOverview, isAdmin ? {} : "skip");
  const router = useRouter();

  // Click a member → load + show their creations in a slide-over.
  const [viewUserId, setViewUserId] = useState<Id<"users"> | null>(null);
  const creations = useQuery(api.admin.userCreations, viewUserId ? { userId: viewUserId } : "skip");
  const [lightbox, setLightbox] = useState<{ code: string; format?: string } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (lightbox) setLightbox(null);
      else if (viewUserId) setViewUserId(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox, viewUserId]);

  const [sortBy, setSortBy] = useState<"spend" | "name" | "month">("spend");
  const sortedMembers = useMemo(() => {
    const arr = [...(data?.members ?? [])];
    if (sortBy === "name")
      return arr.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, undefined, { sensitivity: "base" }));
    if (sortBy === "month") return arr.sort((a, b) => b.monthSpendUsd - a.monthSpendUsd);
    return arr.sort((a, b) => b.allTimeSpendUsd - a.allTimeSpendUsd);
  }, [data, sortBy]);

  useEffect(() => {
    if (me && me.role !== "admin") router.replace("/account");
  }, [me, router]);

  if (me === undefined) {
    return (
      <div className="mm-ambient grid min-h-[100svh] place-items-center">
        <div className="flex items-center gap-2 text-sm text-[#8C8278]">
          <Loader2 className="h-4 w-4 animate-spin text-[#CC7A5C]" /> Loading…
        </div>
      </div>
    );
  }
  if (me === null) {
    return (
      <div className="mm-ambient grid min-h-[100svh] place-items-center">
        <div className="mm-card rounded-xl p-8 text-center">
          <p className="text-sm text-[#F2EEE6]">You&apos;re signed out.</p>
          <Link href="/sign-in" className="mt-3 inline-block text-sm text-[#CC7A5C] underline-offset-4 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="mm-ambient grid min-h-[100svh] place-items-center">
        <div className="mm-card rounded-xl p-8 text-center text-sm text-[#8C8278]">Admins only — redirecting…</div>
      </div>
    );
  }

  const t = data?.totals;
  const successDen = (t?.completed ?? 0) + (t?.failed ?? 0);
  const successPct = successDen > 0 ? Math.round(((t?.completed ?? 0) / successDen) * 100) : 100;

  return (
    <div className="mm-ambient min-h-[100svh] text-[#F2EEE6]">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[rgba(242,238,230,0.08)] bg-[#1C1A18]/85 px-4 py-3 backdrop-blur-md lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-1.5 text-sm text-[#8C8278] hover:text-[#F2EEE6]">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Studio</span>
          </Link>
          <span className="hidden h-5 w-px bg-[rgba(242,238,230,0.12)] sm:block" />
          <BrandLogo className="block h-6 w-auto shrink-0" />
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium">Usage</h1>
          <span className="rounded-full border border-[rgba(242,238,230,0.1)] px-2 py-0.5 text-[9px] uppercase tracking-widest text-[#8C8278]">
            admin
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 lg:px-6 lg:py-10">
        {data === undefined ? (
          <div className="grid place-items-center py-24 text-sm text-[#8C8278]">
            <Loader2 className="h-5 w-5 animate-spin text-[#CC7A5C]" />
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Team usage</h2>
              <span className="text-[11px] text-[#8C8278]">This month · {data.periodMonth}</span>
            </div>
            <p className="mb-5 text-[12px] text-[#8C8278]">
              Spend covers single creations and presentations. {data.activeThisMonth} of {data.memberCount} members active this month.
            </p>

            {/* ── Summary metrics ── */}
            <section className="mm-card mm-fade-up grid grid-cols-2 gap-3 rounded-xl p-4 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Spend this month" value={usd(t!.monthSpendUsd)} sub={`${t!.monthUnits} creations`} Icon={Wallet} />
              <Metric label="Spend all-time" value={usd(t!.allTimeSpendUsd)} sub={`${t!.units} creations`} Icon={TrendingUp} />
              <Metric label="Avg / creation" value={usd(t!.avgCostUsd, 4)} sub="all-time" Icon={Layers} />
              <Metric label="Active members" value={`${data.activeThisMonth}/${data.memberCount}`} sub="this month" Icon={Users} />
              <Metric label="Success rate" value={`${successPct}%`} sub={`${t!.completed} ok · ${t!.failed} failed`} Icon={Activity} />
              <Metric label="Tokens all-time" value={fmtTokens(t!.tokens)} sub={`${t!.generations} gens · ${t!.decks} decks`} Icon={AlertTriangle} />
            </section>

            {/* ── Per-member ── */}
            <div className="mb-2 mt-8 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Per member <span className="text-[#8C8278]">({data.memberCount})</span></h3>
              <div className="flex items-center gap-0.5 rounded-lg border border-[rgba(242,238,230,0.1)] p-0.5 text-[11px]">
                <span className="px-1.5 text-[10px] uppercase tracking-wide text-[#8C8278]">Sort</span>
                {(
                  [
                    ["spend", "Spend"],
                    ["month", "This month"],
                    ["name", "A–Z"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setSortBy(k)}
                    className={`cursor-pointer rounded-md px-2.5 py-1 transition-colors ${
                      sortBy === k ? "bg-[#CC7A5C]/20 text-[#E0936F]" : "text-[#8C8278] hover:text-[#CFC8BD]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2.5">
              {sortedMembers.map((m) => (
                <button
                  key={String(m.userId)}
                  onClick={() => setViewUserId(m.userId)}
                  title={`View ${m.name || m.email}'s creations`}
                  className="mm-card group block w-full cursor-pointer rounded-xl p-4 text-left transition-shadow hover:ring-1 hover:ring-[#CC7A5C]/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    {/* Identity */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-[#F2EEE6]">{m.name || m.email || "—"}</p>
                        {m.role === "admin" && (
                          <span className="rounded-full border border-[rgba(242,238,230,0.1)] px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-[#8C8278]">
                            admin
                          </span>
                        )}
                        <ChevronRight className="h-3.5 w-3.5 text-[#8C8278] transition-colors group-hover:text-[#CC7A5C]" />
                      </div>
                      {m.name && <p className="truncate text-[11px] text-[#8C8278]">{m.email}</p>}
                      <p className="mt-0.5 text-[10px] text-[#8C8278]/70">Last active {fmtDate(m.lastActiveAt)}</p>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-right">
                      <Stat label="This month" value={usd(m.monthSpendUsd)} sub={`${m.monthUnits} creations`} />
                      <Stat label="All-time" value={usd(m.allTimeSpendUsd)} sub={`${m.generations}g · ${m.decks}d`} />
                      <Stat label="Avg/creation" value={usd(m.avgCostUsd, 4)} />
                      <Stat label="Tokens" value={fmtTokens(m.tokens)} />
                    </div>
                  </div>

                  {/* Cap usage bar */}
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[10px] text-[#8C8278]">
                      <span>
                        {m.capUsd > 0 ? `${usd(m.monthSpendUsd)} of ${usd(m.capUsd, 0)} cap` : "No cap"}
                      </span>
                      {m.capUsd > 0 && <span>{Math.round(m.capPct)}%</span>}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(242,238,230,0.08)]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${m.capUsd > 0 ? m.capPct : 0}%`, backgroundColor: capColor(m.capPct) }}
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* ── By format ── */}
            {data.byFormat.length > 0 && (
              <>
                <h3 className="mb-2 mt-8 text-sm font-medium">By format</h3>
                <div className="mm-card rounded-xl p-4">
                  <div className="space-y-2.5">
                    {data.byFormat.map((f) => {
                      const max = Math.max(...data.byFormat.map((x) => x.count), 1);
                      return (
                        <div key={f.format} className="flex items-center gap-3">
                          <span className="w-28 shrink-0 truncate text-[12px] text-[#CFC8BD]">{f.format}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[rgba(242,238,230,0.06)]">
                            <div className="h-full rounded-full bg-[#CC7A5C]/70" style={{ width: `${(f.count / max) * 100}%` }} />
                          </div>
                          <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-[#F2EEE6]">{f.count}</span>
                          <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-[#8C8278]">{usd(f.spendUsd)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <Link href="/account" className="mt-8 inline-flex text-[12px] text-[#8C8278] hover:text-[#CFC8BD]">
              Manage members &amp; caps →
            </Link>
          </>
        )}
      </main>
      <PoweredBy />

      {/* ── Member creations slide-over ── */}
      {viewUserId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setViewUserId(null)}
            aria-hidden
          />
          <div className="relative flex h-full w-full max-w-2xl flex-col bg-[#1C1A18] shadow-2xl ring-1 ring-[rgba(242,238,230,0.08)]">
            <div className="flex shrink-0 items-center justify-between border-b border-[rgba(242,238,230,0.08)] px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#F2EEE6]">{creations?.name || creations?.email || "Member"}</p>
                {creations && (
                  <p className="truncate text-[11px] text-[#8C8278]">
                    {creations.email} · {creations.creationCount} designs · {creations.deckCount} presentations
                  </p>
                )}
              </div>
              <button
                onClick={() => setViewUserId(null)}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-[#CFC8BD] transition-colors hover:bg-[rgba(242,238,230,0.06)] hover:text-[#F2EEE6]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {creations === undefined ? (
                <div className="grid place-items-center py-24">
                  <Loader2 className="h-5 w-5 animate-spin text-[#CC7A5C]" />
                </div>
              ) : creations.creations.length === 0 && creations.decks.length === 0 ? (
                <p className="py-16 text-center text-sm text-[#8C8278]">Nothing created yet.</p>
              ) : (
                <>
                  {creations.creations.length > 0 && (
                    <>
                      <p className="mm-eyebrow mb-2">Designs ({creations.creations.length})</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {creations.creations.map((c) => (
                          <button
                            key={String(c.id)}
                            onClick={() => c.outputCode && setLightbox({ code: c.outputCode, format: c.format })}
                            className="block cursor-pointer overflow-hidden rounded-lg ring-1 ring-[rgba(242,238,230,0.1)] transition hover:ring-[#CC7A5C]/50"
                          >
                            <SvgThumb code={c.outputCode} format={c.format} />
                            <div className="flex items-center justify-between px-2 py-1.5 text-[10px] text-[#8C8278]">
                              <span className="uppercase tracking-wide">{c.format}</span>
                              <span className="tabular-nums">{fmtDate(c.createdAt)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {creations.decks.length > 0 && (
                    <>
                      <p className="mm-eyebrow mb-2 mt-6 flex items-center gap-1.5">
                        <Presentation className="h-3 w-3" /> Presentations ({creations.decks.length})
                      </p>
                      <div className="space-y-2">
                        {creations.decks.map((d) => (
                          <div
                            key={String(d.id)}
                            className="flex items-center gap-3 rounded-lg border border-[rgba(242,238,230,0.08)] p-2"
                          >
                            <button
                              onClick={() => d.thumb && setLightbox({ code: d.thumb, format: "presentation" })}
                              className="aspect-video w-28 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-[rgba(242,238,230,0.1)] hover:ring-[#CC7A5C]/50"
                            >
                              <SvgThumb code={d.thumb} format="presentation" className="!aspect-video" />
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[12px] font-medium text-[#CFC8BD]">{d.title || "Untitled deck"}</p>
                              <p className="text-[10px] text-[#8C8278]">
                                {d.slideCount} slides · {d.status} · {fmtDate(d.createdAt)}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-[11px] text-[#8C8278]">{usd(d.costUsd)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox: a single creation, large ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <div
            className="overflow-hidden rounded-xl bg-white ring-1 ring-[rgba(242,238,230,0.12)] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
            style={{ width: `min(90vw, calc(86vh * ${arOf(lightbox.format)}))` }}
            onClick={(e) => e.stopPropagation()}
            dangerouslySetInnerHTML={{ __html: sanitizeSvg(lightbox.code) }}
          />
          <button
            onClick={() => setLightbox(null)}
            aria-label="Close"
            className="absolute right-4 top-4 grid h-9 w-9 cursor-pointer place-items-center rounded-lg bg-black/50 text-[#F2EEE6] transition-colors hover:bg-black/70"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-[64px]">
      <p className="text-[9px] uppercase tracking-wide text-[#8C8278]">{label}</p>
      <p className="text-sm font-medium tabular-nums text-[#F2EEE6]">{value}</p>
      {sub && <p className="text-[10px] tabular-nums text-[#8C8278]">{sub}</p>}
    </div>
  );
}
