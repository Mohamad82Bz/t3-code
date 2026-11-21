import type { BotAppearance } from "@t3tools/contracts";
import { validateAvatar, type AvatarDefinition, type AvatarMotion } from "open-bot-avatar";
import type { AvatarState } from "./threebot/character";
import { objectAvatarGallery as gallery } from "@t3tools/shared/botAvatars";

export const objectAvatars = gallery as AvatarDefinition[];
const builtIn = new Map(objectAvatars.map((avatar) => [`object:${avatar.id}`, avatar]));
const checked = new WeakMap<BotAppearance, AvatarDefinition | null>();

export function decodeAvatarDefinition(text: string): AvatarDefinition | null {
  try {
    const result = validateAvatar(JSON.parse(text));
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}

export function objectAvatar(appearance: BotAppearance): AvatarDefinition | null {
  if (!appearance.shape.startsWith("object:")) return null;
  const known = builtIn.get(appearance.shape);
  if (known) return known;
  if (!checked.has(appearance)) {
    const definition = appearance.definition ? decodeAvatarDefinition(appearance.definition) : null;
    checked.set(appearance, definition?.id === appearance.shape.slice(7) ? definition : null);
  }
  return checked.get(appearance) ?? null;
}

const thinking = new Set<AvatarState>([
  "thinking",
  "searching",
  "working",
  "listening",
  "loading",
  "dictating",
  "writing",
  "sending",
  "receiving",
  "uploading",
  "spawning",
  "waiting",
  "radar",
  "orbit",
  "progress",
]);
const happy = new Set<AvatarState>([
  "happy",
  "excited",
  "celebrate",
  "proud",
  "laughing",
  "playful",
  "humming",
  "bouncing",
]);

export function objectMood(state: AvatarState): AvatarMotion {
  return thinking.has(state) ? "thinking" : happy.has(state) ? "happy" : "idle";
}
