// Push inherited text presentation attributes down onto every <text>.
//
// Why: Claude often writes <g font-family="Montserrat" font-weight="900"
// text-anchor="middle"> and leaves the <text> children bare. Browsers inherit
// those, so the preview looks right, but three things read each <text> on its
// own and get it wrong:
//   - the attribute validator thinks a centred line is left-aligned and flags
//     it as running off the canvas (false positive → retries shrink the type);
//   - the pixel audit's isolated render has the same blind spot (HARD fail);
//   - the export renderer's Montserrat weight remap only sees the text's own
//     font-family/font-weight, so a bold headline exports in Regular.
// Copying the inherited values onto each <text> (innermost ancestor wins, the
// text's own attributes always win) changes nothing visually and fixes all three.
const INHERITABLE = [
  "font-family",
  "font-weight",
  "font-size",
  "font-style",
  "text-anchor",
  "letter-spacing",
  "dominant-baseline",
  "fill",
];

const attrRe = (k: string) => new RegExp(`\\s${k}\\s*=\\s*"([^"]*)"`, "i");
const hasAttr = (tag: string, k: string) => new RegExp(`\\s${k}\\s*=`, "i").test(tag);

export function pushDownTextAttrs(svg: string): string {
  const stack: Record<string, string>[] = [];
  return svg.replace(/<\/?(g|text|svg|a)\b[^>]*>/gi, (tag: string, name: string) => {
    const el = name.toLowerCase();
    const closing = tag.startsWith("</");
    const selfClosing = /\/>$/.test(tag);
    if (el !== "text") {
      if (closing) stack.pop();
      else if (!selfClosing) {
        const own: Record<string, string> = {};
        for (const k of INHERITABLE) {
          const m = tag.match(attrRe(k));
          if (m) own[k] = m[1];
        }
        stack.push(own);
      }
      return tag;
    }
    if (closing) return tag;
    const inherited: Record<string, string> = {};
    for (const level of stack) Object.assign(inherited, level);
    const style = tag.match(/\sstyle\s*=\s*"([^"]*)"/i)?.[1] ?? "";
    let add = "";
    for (const [k, v] of Object.entries(inherited)) {
      if (hasAttr(tag, k) || new RegExp(`(^|;)\\s*${k}\\s*:`, "i").test(style)) continue;
      add += ` ${k}="${v}"`;
    }
    return add ? tag.replace(/^<text\b/i, `<text${add}`) : tag;
  });
}

// Wordmark <image> tags missing a width or height. Browsers size the missing
// side from the PNG's aspect ratio, but resvg (export, pixel audit) does not:
// it centres the logo in a box as tall as the PNG itself, so an exported
// wordmark lands off the canvas. Fill the missing side from the real ratio.
const MARK_RATIO: Array<[RegExp, number]> = [
  [/mm-logo-white/, 602 / 1992],
  [/mm-logo-black/, 2888 / 7676],
];

export function fillMarkSizes(svg: string): string {
  return svg.replace(/<image\b[^>]*>/gi, (tag) => {
    const ratio = MARK_RATIO.find(([re]) => re.test(tag))?.[1];
    if (!ratio) return tag;
    const w = tag.match(/\swidth\s*=\s*"([\d.]+)"/)?.[1];
    const h = tag.match(/\sheight\s*=\s*"([\d.]+)"/)?.[1];
    if (w && !h) return tag.replace(/^<image\b/i, `<image height="${Math.round(parseFloat(w) * ratio * 10) / 10}"`);
    if (h && !w) return tag.replace(/^<image\b/i, `<image width="${Math.round((parseFloat(h) / ratio) * 10) / 10}"`);
    return tag;
  });
}
