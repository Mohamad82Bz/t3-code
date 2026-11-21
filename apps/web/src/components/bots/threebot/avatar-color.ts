// A Bot's `color` is a palette name ("teal") or a custom "#rrggbb". Everything that draws a Bot
// resolves it here, and derives the colours that keep a face readable on any fill: an outline when
// the fill sits too close to the page, painted eyes when cut-out eyes would vanish into it, and
// overlay/text ink that stays visible. Shared by the web app and the gateway.
import { avatarConfig as config } from "@t3tools/shared/botAvatars";

type Rgb = [number, number, number];

/** Palette names with their fills. Picker ids (yellow, violet...) sit beside the older names. */
export const NAMED_COLORS: Record<string, string> = {
  ...config.colors,
  ...Object.fromEntries(
    config.pickerColors.filter((c) => c.id !== "black").map((c) => [c.id, c.value]),
  ),
};
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#rgb", "#rrggbb" (with or without "#", any case) as lowercase "#rrggbb", or null. */
export function normalizeHex(value: unknown): string | null {
  const match = typeof value === "string" ? HEX.exec(value.trim()) : null;
  if (!match?.[1]) return null;
  const digits = match[1].length === 3 ? [...match[1]].map((d) => d + d).join("") : match[1];
  return `#${digits.toLowerCase()}`;
}

export const isNamedColor = (value: unknown): value is string =>
  typeof value === "string" && Object.hasOwn(NAMED_COLORS, value);

/** A custom colour: "#rrggbb" (any case, or "#rgb") rather than a palette name. */
export const isCustomColor = (value: unknown): value is string =>
  !isNamedColor(value) &&
  typeof value === "string" &&
  value.startsWith("#") &&
  !!normalizeHex(value);

/** The fill for a stored colour. Anything unknown falls back to teal, as it always has. */
export function colorHex(value: unknown): string {
  if (isNamedColor(value)) return NAMED_COLORS[value] ?? config.colors.teal;
  return (
    (typeof value === "string" && value.startsWith("#") && normalizeHex(value)) ||
    config.colors.teal
  );
}

const parseHex = (hex: string): Rgb => {
  const h = normalizeHex(hex) ?? "#000000";
  return [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Rgb;
};
const toHex = (rgb: Rgb) =>
  `#${rgb
    .map((c) =>
      Math.round(Math.max(0, Math.min(255, c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
  ([0, 1, 2] as const).map((i) => a[i] + (b[i] - a[i]) * t) as Rgb;

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance(hex: string) {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
/** WCAG contrast ratio, 1 to 21. */
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Typical page colours behind a Bot in each theme: the app's light canvas and dark canvas. */
const SURFACES = { light: "#f9f8fd", dark: "#16141f" } as const;
type Theme = keyof typeof SURFACES;
/** Below this a fill blends into the page. Every palette colour except white clears it. */
const READABLE = 1.6;
const EDGE = 2.4;

/** The fill pushed toward black (light theme) or white (dark theme) until it stands off the page. */
function standOff(fill: string, theme: Theme, target: number) {
  const base = parseHex(fill),
    toward: Rgb = theme === "light" ? [16, 16, 24] : [255, 255, 255];
  for (let t = 0.1; t < 1; t += 0.05) {
    const candidate = toHex(mix(base, toward, t));
    if (contrast(candidate, SURFACES[theme]) >= target) return candidate;
  }
  return toHex(toward);
}

/** Painted eyes: a near-black or near-white ink tinted with the fill, whichever reads better on it. */
function eyeInk(fill: string) {
  const base = parseHex(fill);
  const dark = toHex(mix(base, [12, 12, 18], 0.86)),
    light = toHex(mix(base, [255, 255, 255], 0.9));
  return contrast(dark, fill) >= contrast(light, fill) ? dark : light;
}

interface ThemeInk {
  /** An outline for the body, or null when the fill already stands off the page. */
  edge: string | null;
  /** Painted eye colour, or null when eyes cut out of the body (showing the page) read fine. */
  eye: string | null;
  /** Thinking dots, rings and names: the fill, or its outline when the fill would vanish. */
  ink: string;
}

/** How a fill stays readable on each theme's page. */
export function avatarInk(fill: string): Record<Theme, ThemeInk> {
  const hex = normalizeHex(fill) ?? config.colors.teal;
  const theme = (name: Theme): ThemeInk => {
    if (contrast(hex, SURFACES[name]) >= READABLE) return { edge: null, eye: null, ink: hex };
    const edge = standOff(hex, name, EDGE);
    return { edge, eye: eyeInk(hex), ink: edge };
  };
  return { light: theme("light"), dark: theme("dark") };
}
