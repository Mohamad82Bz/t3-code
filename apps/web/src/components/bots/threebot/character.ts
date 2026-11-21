import { avatarConfig as config } from "@t3tools/shared/botAvatars";
import {
  avatarInk,
  isCustomColor,
  isNamedColor,
  NAMED_COLORS,
  normalizeHex,
} from "./avatar-color.ts";
import { cutoutEyes } from "./avatar-eyes.ts";
import { decorateT3Avatar } from "./avatar-t3.ts";
import { Character as Engine } from "./engine.ts";

export type AppAvatarState =
  | "idle"
  | "working"
  | "thinking"
  | "waiting"
  | "sleeping"
  | "happy"
  | "failed";
export type AvatarState = keyof typeof config.states;
const SHAPE_NAMES = config.shapes;
export const PICKER_SHAPES = config.pickerShapes;
export const PICKER_COLORS = config.pickerColors;
const COLORS: Record<string, string> = NAMED_COLORS;
const shapeAliases: Record<string, string> = config.shapeAliases;

export function avatarShape(name: string) {
  return SHAPE_NAMES.includes(name) || PICKER_SHAPES.includes(name)
    ? name
    : Object.hasOwn(shapeAliases, name)
      ? (shapeAliases[name] ?? "blob")
      : "blob";
}

const BLACK = "light-dark(#000000, #FFFFFF)";
/** The fill for a stored colour: a palette name or "#rrggbb". Anything else is teal. */
export function botColor(name: string | undefined) {
  if (name === "black") return BLACK;
  if (isNamedColor(name)) return COLORS[name] ?? config.colors.teal;
  return (isCustomColor(name) && normalizeHex(name)) || config.colors.teal;
}

const EYE_BG = "var(--bot-eye-bg, var(--background))";
const pair = (light: string | null, dark: string | null, fallback: string) =>
  light === dark ? (light ?? fallback) : `light-dark(${light ?? fallback}, ${dark ?? fallback})`;
/** How a fill stays readable on the page in each theme: CSS colours, or null where nothing is needed. */
export function fillInk(fill: string) {
  if (!fill.startsWith("#")) return null;
  const { light, dark } = avatarInk(fill);
  return {
    edge: light.edge || dark.edge ? pair(light.edge, dark.edge, "transparent") : null,
    // Cut-out eyes show the page, so a fill close to the page gets painted eyes instead.
    eye: light.eye || dark.eye ? pair(light.eye, dark.eye, EYE_BG) : null,
    // An untouched fill stays exactly as given.
    ink:
      light.ink === dark.ink && light.ink === normalizeHex(fill)
        ? fill
        : pair(light.ink, dark.ink, fill),
  };
}
/** Whether this fill paints its eyes (true) or cuts them out (false): switching rebuilds the character. */
export const paintsEyes = (fill: string) => !!fillInk(fill)?.eye;

/** The outline, eye and overlay colours for a fill, on an existing character. */
export function applyInk(svg: SVGSVGElement, character: Pick<Character, "parts">, fill: string) {
  const ink = fillInk(fill);
  const { body, eyes } = character.parts();
  if (ink?.edge) {
    body.setAttribute("stroke", ink.edge);
    body.setAttribute("stroke-width", "1.25");
    body.setAttribute("vector-effect", "non-scaling-stroke");
  } else body.setAttribute("stroke", "none");
  if (ink?.eye) for (const eye of eyes) eye.style.fill = ink.eye;
  svg.style.setProperty("--fg", ink?.ink ?? fill);
}

interface Character {
  overlay: { x: number };
  setState(state: string, options?: { resetEyes: boolean }): void;
  setShape(shape: string): void;
  setInk(color: string): void;
  setSize(size: number): void;
  setGazeTarget(point: { x: number; y: number } | null): void;
  step(seconds: number): void;
  holdFrame(): void;
  parts(): { body: SVGPathElement; eyes: SVGPathElement[] };
  destroy(): void;
}

export function createCharacter(
  svg: SVGSVGElement,
  props: { shape: string; state: AvatarState; fill: string; size: number },
): Character {
  const t3 = props.shape === "t3";
  const character: Character = new Engine(svg, {
    shape: t3 ? "ball" : avatarShape(props.shape),
    state: config.states[props.state],
    inkFlat: t3 ? config.colors.purple : props.fill,
    eyeColor: t3 ? "#ffffff" : EYE_BG,
    sizePx: props.size,
  });
  if (t3) {
    const skin = decorateT3Avatar(svg, character.parts());
    skin.setState(config.states[props.state]);
    skin.setSize(props.size);
    return {
      setState(state, options) {
        character.setState(state, options);
        skin.setState(state);
      },
      // Special editions own their silhouette and palette. AvatarPlayer rebuilds
      // the character when entering or leaving a special edition.
      setShape() {},
      setInk() {},
      setSize(size) {
        character.setSize(size);
        skin.setSize(size);
      },
      setGazeTarget(point) {
        skin.setGazeTarget(point);
      },
      step(seconds) {
        character.setGazeTarget(skin.eyeTarget());
        character.step(seconds);
        skin.setFold(character.overlay.x);
        skin.step(seconds);
      },
      holdFrame() {
        character.holdFrame();
        skin.holdFrame();
      },
      overlay: character.overlay,
      parts: character.parts.bind(character),
      destroy: character.destroy.bind(character),
    };
  }
  if (!paintsEyes(props.fill)) cutoutEyes(svg, character.parts());
  applyInk(svg, character, props.fill);
  return character;
}

export const characterState = (state: AvatarState) => config.states[state];
