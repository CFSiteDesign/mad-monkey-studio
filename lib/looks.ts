// The looks people pick from: one design system each, shown with real
// examples so nobody has to guess what a name means. Example posters live in
// public/looks/ (made by the Studio itself on the local test bank).

export type LookExample = { src: string; w: number; h: number };

export type Look = {
  /** design_systems.name sent to generation */
  name: string;
  label: string;
  /** One short line: what it looks like */
  desc: string;
  group: "events" | "classic";
  /** Formats the look is built for (shown as a hint on the format picker) */
  bestFor?: string[];
  examples: LookExample[];
};

const ex = (name: string, dims: [number, number][]): LookExample[] =>
  dims.map(([w, h], i) => ({ src: `/looks/${name}-${i + 1}.jpg`, w, h }));

const STORY: [number, number] = [405, 720];
const WIDE: [number, number] = [720, 473];
const SQUARE: [number, number] = [720, 720];
const POST: [number, number] = [576, 720];

export const LOOKS: Look[] = [
  {
    name: "event-photo",
    label: "Event Photo",
    desc: "The event's own photo, big white title and the details",
    group: "events",
    bestFor: ["9:16", "whatsapp-landscape"],
    examples: ex("event-photo", [STORY, WIDE, STORY]),
  },
  {
    name: "big-block",
    label: "Big Block",
    desc: "Moody photo, giant slanted title in colour",
    group: "events",
    bestFor: ["9:16", "whatsapp-landscape"],
    examples: ex("big-block", [STORY, WIDE, STORY]),
  },
  {
    name: "spotlight",
    label: "Spotlight",
    desc: "Purple page, orange title, people cut out in front",
    group: "events",
    bestFor: ["9:16", "whatsapp-landscape"],
    examples: ex("spotlight", [STORY, WIDE, STORY]),
  },
  {
    name: "giant-type",
    label: "Giant Type",
    desc: "One bold colour, huge stacked title, people in front",
    group: "events",
    bestFor: ["9:16", "whatsapp-landscape"],
    examples: ex("giant-type", [STORY, WIDE, STORY]),
  },
  {
    name: "underground",
    label: "Underground",
    desc: "Black and white photo, small type, giant date",
    group: "events",
    bestFor: ["9:16", "whatsapp-landscape"],
    examples: ex("underground", [STORY, WIDE, WIDE]),
  },
  {
    name: "brand",
    label: "Brand",
    desc: "Loud sticker-collage Mad Monkey poster",
    group: "classic",
    examples: ex("brand", [SQUARE, POST, STORY]),
  },
  {
    name: "girly-pop",
    label: "Girly Pop",
    desc: "Retro pinks, script type, flowers and checks",
    group: "classic",
    examples: ex("girly-pop", [POST, STORY, POST]),
  },
  {
    name: "minimal-bold",
    label: "Minimal Bold",
    desc: "Black page, giant white type, one photo",
    group: "classic",
    examples: ex("minimal-bold", [STORY, SQUARE, SQUARE]),
  },
];

export const LOOK_GROUPS: { id: Look["group"]; title: string; note: string }[] = [
  { id: "events", title: "Event templates", note: "Built for tonight's event. Best as a Story or WhatsApp landscape." },
  { id: "classic", title: "Classic styles", note: "Free-form Mad Monkey posters for any format." },
];

export const lookByName = (name: string): Look => LOOKS.find((l) => l.name === name) ?? LOOKS[0];
