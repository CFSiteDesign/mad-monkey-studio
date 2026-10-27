// Event-template briefs are labelled lines (HEADLINE: …, WHEN: …) for the
// model. People should never see that form: show the title and key facts.

const LABELS = ["HEADLINE", "DETAILS", "WHEN", "WHERE", "PRICE", "KEY LINE", "TAGLINE", "PHOTO"];

function field(brief: string, label: string): string | undefined {
  const others = LABELS.filter((l) => l !== label).join("|");
  const m = brief.match(new RegExp(`(?:^|\\n|\\s)${label}:\\s*([\\s\\S]*?)(?=\\s*(?:${others}):|$)`));
  return m?.[1]?.trim() || undefined;
}

const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s(&/-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());

/** "Rooftop Sundowners · Saturday 5pm · Mad Monkey Bangkok" for a labelled
 *  brief; any other brief comes back unchanged. */
export function readableBrief(brief: string): string {
  if (!/^\s*HEADLINE:/.test(brief)) return brief;
  const head = field(brief, "HEADLINE");
  return [head, field(brief, "WHEN"), field(brief, "WHERE"), field(brief, "PRICE")]
    .filter((v): v is string => Boolean(v))
    .map(titleCase)
    .join(" · ");
}

/** Just the event title of a labelled brief (for thread titles). */
export function briefTitle(brief: string): string {
  if (!/^\s*HEADLINE:/.test(brief)) return brief;
  const head = field(brief, "HEADLINE");
  return head ? titleCase(head) : brief;
}
