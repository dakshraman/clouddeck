export const THEMES = [
  {
    id: "daylight",
    name: "Daylight",
    description: "CloudDeck Uni palette — clean warm surfaces, marine teal, and peach accent.",
    preview: ["#FAF7F5", "#235361", "#FAAA93"],
  },
  {
    id: "luma",
    name: "Luma",
    description: "Graphite with a cyan edge.",
    preview: ["hsl(0 0% 3.9%)", "hsl(0 0% 9.1%)", "hsl(189.5 100% 42.9%)"],
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep navy, electric blue.",
    preview: ["hsl(222 47% 5.5%)", "hsl(222 34% 10%)", "hsl(199 89% 55%)"],
  },
  {
    id: "forest",
    name: "Forest",
    description: "Mossy dark, emerald green.",
    preview: ["hsl(160 30% 4%)", "hsl(160 20% 8.5%)", "hsl(158 74% 48%)"],
  },
  {
    id: "ember",
    name: "Ember",
    description: "Warm charcoal, amber glow.",
    preview: ["hsl(20 25% 4.5%)", "hsl(20 18% 9%)", "hsl(32 95% 58%)"],
  },
  {
    id: "orchid",
    name: "Orchid",
    description: "Plum shadows, violet glow.",
    preview: ["hsl(270 28% 5%)", "hsl(270 20% 10%)", "hsl(270 90% 68%)"],
  },
  {
    id: "rose",
    name: "Rose",
    description: "Muted wine, rose glow.",
    preview: ["hsl(340 25% 5%)", "hsl(340 18% 10%)", "hsl(347 90% 66%)"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "daylight";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEMES.some((theme) => theme.id === value) || value === "clouddeck");
}

export function getTheme(id: ThemeId | "clouddeck") {
  const targetId = id === "clouddeck" ? "daylight" : id;
  return THEMES.find((theme) => theme.id === targetId) ?? THEMES[0];
}
