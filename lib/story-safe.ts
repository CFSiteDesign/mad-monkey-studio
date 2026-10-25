// Nudge the wordmark inside a 9:16 story's safe zone.
//
// Instagram covers the top ~230px and bottom ~400px of a story. The model
// sometimes parks the wordmark at y=210 and keeps it there through every retry;
// moving a mark a few pixels needs no model, so it is done here instead. Only
// untransformed wordmark images are moved; everything is re-validated after.
export function clampMarksToStory(svg: string, top: number, bottom: number): string {
  return svg.replace(/<image\b[^>]*mm-logo-(?:white|black)[^>]*>/gi, (tag) => {
    if (/\stransform\s*=/.test(tag)) return tag;
    const y = parseFloat(tag.match(/\sy\s*=\s*"(-?[\d.]+)"/)?.[1] ?? "NaN");
    const h = parseFloat(tag.match(/\sheight\s*=\s*"([\d.]+)"/)?.[1] ?? "NaN");
    if (!Number.isFinite(y) || !Number.isFinite(h)) return tag;
    const fixed = Math.min(Math.max(y, top), bottom - h);
    return fixed === y ? tag : tag.replace(/(\sy\s*=\s*")-?[\d.]+(")/, `$1${Math.round(fixed)}$2`);
  });
}
