// Claude 5 models can answer in several content blocks (a thinking block
// first, then the text). Reading `content[0]` silently drops the answer, so
// every action joins the text blocks instead.
export function textOf(msg: { content: Array<{ type: string; text?: string }> }): string {
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
}

// Opus 5.5 always thinks (thinking "disabled" is rejected). Low effort keeps a
// poster fast: deep thinking was ~6x slower on Opus 5 with no better layouts.
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const effortFrom = (v: string | undefined, fallback: Effort): Effort =>
  v && EFFORTS.includes(v) ? (v as Effort) : fallback;
// CREATION_EFFORT / REVIEW_EFFORT in the Convex env override these defaults.
// Read at call time: Convex env vars are not reliably set when a module loads.
export const creationEffort = (): Effort => effortFrom(process.env.CREATION_EFFORT, "low");

// The art director pass looks at the rendered poster and decides what to fix:
// that judgement is worth more thinking than writing the first draft.
export const reviewEffort = (): Effort => effortFrom(process.env.REVIEW_EFFORT, "medium");
