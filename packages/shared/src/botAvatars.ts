import avatarConfig from "./avatar-config.json" with { type: "json" };
import objectAvatarGallery from "./object-avatars.json" with { type: "json" };
import type { BotAppearance, BotProfile } from "@t3tools/contracts";

export { avatarConfig, objectAvatarGallery };
const TAU = Math.PI * 2;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

type Silhouette = (a: number) => number;
const superellipse =
  (n: number, ax = 1, ay = 1): Silhouette =>
  (a) => {
    const c = Math.abs(Math.cos(a)) / ax,
      s = Math.abs(Math.sin(a)) / ay;
    return 1 / Math.pow(c ** n + s ** n, 1 / n);
  };
const polygon =
  (sides: number, rotation: number, softness: number): Silhouette =>
  (a) => {
    const step = TAU / sides,
      local = ((((a - rotation) % step) + step) % step) - step / 2;
    return mix(Math.cos(Math.PI / sides) / Math.cos(local), 1, softness);
  };
const lobes =
  (count: number, depth: number, phase = 0, sharpness = 1): Silhouette =>
  (a) =>
    1 - depth + depth * ((1 + Math.cos(count * a + phase)) / 2) ** sharpness;
// Measured from the top of the shape: a notch, two lobes, then in to a soft point.
const heart: Silhouette = (a) => {
  const x = Math.abs(Math.atan2(Math.cos(a), -Math.sin(a))) / Math.PI;
  if (x < 0.3) return 0.6 + 0.42 * Math.sin((x / 0.3) * (Math.PI / 2)) ** 0.8;
  return (
    1.02 -
    0.3 * Math.sin(((x - 0.3) / 0.7) * Math.PI) ** 0.8 +
    0.12 * Math.max(0, (x - 0.86) / 0.14)
  );
};
const SILHOUETTES: Record<string, Silhouette> = {
  ball: () => 1,
  blob: (a) => 0.94 + 0.05 * Math.sin(2 * a + 0.6) + 0.03 * Math.sin(3 * a + 1.4),
  pebble: superellipse(2.4, 1, 0.82),
  squircle: superellipse(4.4, 0.9, 0.9),
  tablet: superellipse(4.2, 0.72, 1),
  capsule: superellipse(2.9, 0.62, 1),
  hex: polygon(6, 0, 0.14),
  gem: polygon(4, 0, 0.12),
  wedge: polygon(3, -Math.PI / 2, 0.16),
  drop: (a) => 0.72 + 0.26 * ((1 + Math.sin(a)) / 2) ** 0.7 + 0.46 * ((1 - Math.sin(a)) / 2) ** 9,
  cloud: lobes(6, 0.15, Math.PI / 6, 0.7),
  flower: lobes(6, 0.26, Math.PI, 1),
  clover: lobes(4, 0.3, 0, 0.8),
  star: lobes(5, 0.4, Math.PI / 2, 1.3),
  spark: lobes(4, 0.46, 0, 1.3),
  heart,
  dome: (a) => (Math.sin(a) < 0 ? 0.98 : superellipse(5, 0.98, 0.84)(a)),
};
export const avatarSilhouette = (name: string) => SILHOUETTES[name] ?? (() => 1);

const legacyColors = {
  sky: "blue",
  mint: "green",
  amber: "amber",
  rose: "pink",
  iris: "violet",
  slate: "gray",
} as const;
export function resolveBotAppearance(bot: Pick<BotProfile, "accent" | "avatar">): BotAppearance {
  return bot.avatar ?? { shape: "ball", color: legacyColors[bot.accent] };
}

const colors = new Map(Object.entries(avatarConfig.colors));
for (const { id, value } of avatarConfig.pickerColors) colors.set(id, value);
export function avatarHex(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : (colors.get(color) ?? avatarConfig.colors.teal);
}

const paths = new Map<string, string>();
export function avatarSilhouettePath(shape: string) {
  const known = avatarConfig.shapes.includes(shape) ? shape : "ball";
  const cached = paths.get(known);
  if (cached !== undefined) return cached;
  const radius = avatarSilhouette(known);
  const result =
    Array.from({ length: 72 }, (_, index) => {
      const angle = (TAU * index) / 72;
      const r = 42 * radius(angle);
      return (
        (index === 0 ? "M" : "L") +
        (50 + r * Math.cos(angle)).toFixed(1) +
        " " +
        (50 + r * Math.sin(angle)).toFixed(1)
      );
    }).join("") + "Z";
  paths.set(known, result);
  return result;
}
