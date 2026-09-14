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
