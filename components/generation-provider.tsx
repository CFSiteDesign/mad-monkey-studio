"use client";

// Owns the (long-running) asset generation lifecycle ABOVE the page, so it
// survives client-side navigation. The studio page can kick off a generation,
// the user can pop over to /account or /bank, and the Claude call keeps running
// here — when they return, the loader and the finished design are still there.
//
// Mounted inside ConvexClientProvider (root layout) → never unmounts on route
// changes, unlike the page that consumes it.

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type GenResult = {
  generationId: Id<"generations">;
  threadId: Id<"threads">;
  outputCode: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  retryCount: number;
  notes?: string[];
  format: string;
  designSystem: string;
};

type ComposeArgs = {
  title: string;
  date: string;
  cost?: string;
  location: string;
  format: string;
  designSystem: string;
  followUps?: { q: string; a: string }[];
  extraDetails?: string;
};

export type RunAssetArgs = {
  /** Refinement: send the refine text straight through. */
  briefText?: string;
  /** New creation: Haiku composes the brand-voiced brief from these first. */
  compose?: ComposeArgs;
  format: string;
  designSystem: string;
  threadId?: Id<"threads">;
  includeLogo: boolean;
  includeAllIn: boolean;
  includeAllInMonkey: boolean;
  includeStamp: boolean;
};

type GenerationCtx = {
  generating: boolean;
  result: GenResult | null;
  error: string;
  /** Thread of the in-flight or just-finished generation (for re-attaching). */
  activeThreadId: Id<"threads"> | null;
  runAsset: (args: RunAssetArgs) => Promise<GenResult | null>;
  clearResult: () => void;
  setError: (e: string) => void;
};

const Ctx = createContext<GenerationCtx | null>(null);

export function useGeneration(): GenerationCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGeneration must be used within GenerationProvider");
  return ctx;
}

export function GenerationProvider({ children }: { children: ReactNode }) {
  const composeBrief = useAction(api.briefs.composeBrief);
  const generateAsset = useAction(api.generations.generateAsset);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);
  const [error, setError] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<Id<"threads"> | null>(null);
  const inFlight = useRef(false);

  const runAsset = useCallback(
    async (args: RunAssetArgs): Promise<GenResult | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setGenerating(true);
      setError("");
      setResult(null);
      // Refinement: the thread is known up-front, so re-attach immediately —
      // navigating away and back mid-refine still lands on the right thread.
      if (args.threadId) setActiveThreadId(args.threadId);
      try {
        let briefText = args.briefText ?? "";
        if (args.compose) {
          const composed = await composeBrief(args.compose);
          briefText = composed.brief;
        }
        const res = await generateAsset({
          brief: briefText,
          format: args.format,
          designSystem: args.designSystem,
          threadId: args.threadId,
          includeLogo: args.includeLogo,
          includeAllIn: args.includeAllIn,
          includeAllInMonkey: args.includeAllInMonkey,
          includeStamp: args.includeStamp,
        });
        const full: GenResult = { ...res, format: args.format, designSystem: args.designSystem };
        setResult(full);
        setActiveThreadId(res.threadId);
        return full;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed.");
        return null;
      } finally {
        setGenerating(false);
        inFlight.current = false;
      }
    },
    [composeBrief, generateAsset],
  );

  const clearResult = useCallback(() => {
    setResult(null);
    setError("");
    setActiveThreadId(null);
  }, []);

  return (
    <Ctx.Provider
      value={{ generating, result, error, activeThreadId, runAsset, clearResult, setError }}
    >
      {children}
    </Ctx.Provider>
  );
}
