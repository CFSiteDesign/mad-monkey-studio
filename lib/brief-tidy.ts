// Deterministic clean-up of an event-template ("title mode") brief.
//
// The brief writer is told to keep the title verbatim, leave PRICE out when no
// cost was given and never repeat a fact, but it slips: "PRICE: Not provided",
// a reworded headline, "5 DRINKS INCLUDED" in both DETAILS and KEY LINE. The
// poster then prints the slip. This pass enforces those rules in code.

export type TitleFacts = {
  title: string;
  date: string;
  location: string;
  cost?: string;
  /** Everything else the user typed (follow-up answers, extra details). */
  source?: string;
};

const PLACEHOLDER = /^(not (provided|given|specified|stated)|n\/?a|none|tbc|tba|unknown|-+|no (cost|price)\b.*)$/i;
const LINE = /^([A-Z][A-Z ]{1,14}):\s*(.*)$/;

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9฿₱$€£¥₫៛]+/g, " ").trim();
const words = (s: string) => norm(s).split(" ").filter(Boolean);

const STOP = new Set(["THE", "A", "AN", "OF", "FOR", "AT", "TO", "AND", "IN", "ON", "WITH", "YOUR", "UP", "GETS", "GET", "IS"]);
// Crude stem so WINNERS / WINNING / WINNER and TEAMS / TEAM compare equal.
const stem = (w: string) => (w.length > 4 ? w.replace(/(ING|ERS|ER|ES|S)$/, "") : w);
const content = (s: string) => words(s).filter((w) => !STOP.has(w)).map(stem);

// An item repeats a fact when most of the shorter one's words appear in the
// other: "FREE BUCKET FOR THE WINNING TEAM" repeats "FREE BUCKET FOR THE WINNERS".
function repeats(item: string, fact: string): boolean {
  const a = content(item);
  const b = new Set(content(fact));
  if (!a.length || !b.size) return false;
  const overlap = new Set(a.filter((w) => b.has(w))).size;
  return overlap / Math.min(new Set(a).size, b.size) >= 0.66;
}

// The user's own words must make up most of an item, or the writer invented it.
function fromUser(item: string, source: Set<string>): boolean {
  const a = content(item);
  if (!a.length) return false;
  return a.filter((w) => source.has(w)).length / a.length >= 0.6;
}

const DAY_RE = /\b(?:(?:MON|TUE|WED|THU|FRI|SAT|SUN)(?:DAY|S|SDAY|NESDAY|R|RS|RSDAY|URDAY)?|TODAY|TONIGHT|TOMORROW)\b/g;
const TIME_RE = /\b\d{1,2}(?:[:.]\d{2})?\s*(?:AM|PM)\b/g;
const dayKey = (d: string) => (/^(TODAY|TONIGHT|TOMORROW)$/.test(d) ? d : d.slice(0, 3));
const timeKey = (t: string) => t.replace(/\s+/g, "").replace(/[:.]00/, "");

// Templates that print only the KEY LINE (Event Photo, Spotlight) lose any day
// or time the writer left out of it ("8PM - SHOTS" for "Tuesday & Friday, 8pm").
// When that happens, rebuild its time part from WHEN and keep the perk.
function completeKeyLine(key: string, when: string): string {
  const K = key.toUpperCase();
  const W = when.toUpperCase();
  const days = [...W.matchAll(DAY_RE)].map((m) => m[0]);
  const times = [...W.matchAll(TIME_RE)].map((m) => m[0].replace(/\s+/g, ""));
  const kDays = new Set([...K.matchAll(DAY_RE)].map((m) => dayKey(m[0])));
  const kTimes = new Set([...K.matchAll(TIME_RE)].map((m) => timeKey(m[0])));
  const missing = days.some((d) => !kDays.has(dayKey(d))) || times.some((t) => !kTimes.has(timeKey(t)));
  if (!missing) return key;
  const dayPart = days.join(" & ");
  const range = times.length === 2 && /\d\s*(AM|PM)\s*(-|–|TO|UNTIL|TIL)\s*\d/.test(W);
  const timePart = range ? times.join("-") : times.join(" & ");
  const perk = K.split(/\s+[-–]\s+/)
    .filter((seg) => !seg.match(DAY_RE) && !seg.match(TIME_RE))
    .join(" - ");
  const when2 = [dayPart, timePart].filter(Boolean).join(" ");
  return perk ? `${when2} - ${perk}` : when2;
}

export function tidyTitleBrief(brief: string, facts: TitleFacts): string {
  const order: string[] = [];
  const vals = new Map<string, string>();
  for (const raw of brief.split("\n")) {
    const m = raw.trim().match(LINE);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim();
    if (!val || PLACEHOLDER.test(val)) continue;
    if (!vals.has(key)) order.push(key);
    vals.set(key, val);
  }

  vals.set("HEADLINE", facts.title.trim().toUpperCase());
  if (!vals.get("WHEN")) vals.set("WHEN", facts.date.trim());
  if (!vals.get("WHERE")) vals.set("WHERE", facts.location.trim());
  // The price is the user's own words: "₱300 per team" must not become "₱300".
  if (facts.cost?.trim()) vals.set("PRICE", facts.cost.trim().toUpperCase());
  else vals.delete("PRICE");

  const key = vals.get("KEY LINE");
  if (key) vals.set("KEY LINE", completeKeyLine(key, vals.get("WHEN") ?? facts.date));

  const details = vals.get("DETAILS");
  if (details) {
    const others = ["KEY LINE", "WHEN", "WHERE", "PRICE", "HEADLINE"].map((k) => vals.get(k) ?? "");
    // The key line holds "time - perk": test the perk half on its own too.
    const keyParts = (vals.get("KEY LINE") ?? "").split(/\s+[-–]\s+/);
    const source = new Set(content([facts.title, facts.date, facts.location, facts.cost ?? "", facts.source ?? ""].join(" ")));
    const seen = new Set<string>();
    const kept = details
      .split(/\s+[-–•·|]\s+/)
      .map((s) => s.trim())
      .filter((item) => {
        const k = norm(item);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        if (!fromUser(item, source)) return false;
        return ![...others, ...keyParts].some((f) => f && repeats(item, f));
      });
    if (kept.length) vals.set("DETAILS", kept.join(" - "));
    else vals.delete("DETAILS");
  }

  const CANON = ["HEADLINE", "DETAILS", "WHEN", "WHERE", "PRICE", "KEY LINE", "TAGLINE", "PHOTO"];
  const keys = [...CANON, ...order.filter((k) => !CANON.includes(k))];
  return keys.filter((k) => vals.get(k)).map((k) => `${k}: ${vals.get(k)}`).join("\n");
}
