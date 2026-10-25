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
export const CREATION_EFFORT = "low" as const;
