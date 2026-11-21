import { DEFAULT_BOT_APPEARANCE, type BotAppearance, type BotProfile } from "@t3tools/contracts";
import { renderAvatarSvg } from "open-bot-avatar";
import { mountAvatar } from "open-bot-avatar/dom";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { AvatarPlayer } from "../bots/threebot/avatar-player";
import { botColor, fillInk, type AvatarState } from "../bots/threebot/character";
import { objectAvatar, objectMood } from "../bots/avatarObjects";

const legacyColors = {
  sky: "blue",
  mint: "green",
  amber: "amber",
  rose: "pink",
  iris: "violet",
  slate: "gray",
} as const;

export function botAppearance(bot: Pick<BotProfile, "accent" | "avatar">): BotAppearance {
  return bot.avatar ?? { shape: "ball", color: legacyColors[bot.accent] };
}

function subscribeReducedMotion(notify: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function BotAvatar({
  appearance = DEFAULT_BOT_APPEARANCE,
  state = "idle",
  size = 36,
  animate = false,
}: {
  appearance?: BotAppearance;
  state?: AvatarState;
  size?: number;
  animate?: boolean;
}) {
  const shade = botColor(appearance.color);
  const object = appearance.picture ? null : objectAvatar(appearance);
  const shape = appearance.shape.startsWith("object:") ? "ball" : appearance.shape;
  const svg = useRef<SVGSVGElement>(null);
  const player = useRef<AvatarPlayer | null>(null);
  const reduced = useSyncExternalStore(subscribeReducedMotion, reduceMotion, () => true);
  const animated = animate && !reduced;
  const props = { shape, fill: shade, state, size, animate: animated };
  const initial = useRef(props);
  const usesEngine = !appearance.picture && object === null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the upstream animation engine owns this SVG's children
  useLayoutEffect(() => {
    if (!usesEngine || !svg.current) return;
    const mounted = new AvatarPlayer(svg.current, initial.current);
    player.current = mounted;
    return () => {
      mounted.destroy();
      player.current = null;
    };
  }, [usesEngine]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- update the mounted animation engine without rebuilding its SVG
  useLayoutEffect(() => {
    player.current?.update({ shape, fill: shade, state, size, animate: animated });
  }, [shape, shade, state, size, animated]);
  return (
    <span
      className="inline-flex shrink-0 align-middle"
      style={{ width: size, height: size }}
      aria-hidden
      data-bot-avatar={appearance.shape}
      data-bot-avatar-state={state}
    >
      {appearance.picture ? (
        <img
          src={appearance.picture}
          alt=""
          width={size}
          height={size}
          className="size-full rounded-full object-cover"
        />
      ) : object ? (
        <ObjectAvatar
          definition={object}
          color={appearance.color}
          state={state}
          animate={animated}
        />
      ) : (
        <svg ref={svg} width={size} height={size} className="overflow-visible" />
      )}
    </span>
  );
}

function ObjectAvatar({
  definition,
  color,
  state,
  animate,
}: {
  definition: NonNullable<ReturnType<typeof objectAvatar>>;
  color: string;
  state: AvatarState;
  animate: boolean;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const fill = botColor(color);
  const ink = fillInk(fill);
  const eye = ink?.eye ?? "var(--bot-eye-bg, var(--background))";
  const mood = objectMood(state);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Open Bot Avatar mounts and disposes its own renderer
  useLayoutEffect(() => {
    if (!animate || !host.current) return;
    const renderer = mountAvatar(host.current, {
      definition,
      color: fill,
      eyeColor: eye,
      mood,
      followPointer: true,
      label: "",
    });
    return () => renderer.destroy();
  }, [animate, definition, fill, eye, mood]);
  if (animate) return <span ref={host} className="block size-full" />;
  return (
    <img
      alt=""
      className="size-full object-contain"
      src={`data:image/svg+xml,${encodeURIComponent(renderAvatarSvg(definition, { color: color === "black" ? "#272727" : fill }))}`}
    />
  );
}
