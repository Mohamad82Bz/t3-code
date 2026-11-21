// One shared, visibility-aware clock drives the character engine from the reference.
import {
  applyInk,
  avatarShape,
  characterState,
  createCharacter,
  paintsEyes,
  type AvatarState,
} from "./character";

const FRAME_MS = 1000 / 30;
const FOLLOW_MIN_SIZE = 32;
const STILL_BELOW = 18;

export interface AvatarProps {
  shape: string;
  fill: string;
  size: number;
  state: AvatarState;
  animate: boolean;
}

const players = new Set<AvatarPlayer>();
let raf = 0;
let lastMs = 0;
let started = false;
let reducedMotion = false;
let pointer: { x: number; y: number } | null = null;
let observer: IntersectionObserver | null = null;
const byElement = new WeakMap<Element, AvatarPlayer>();

function startGlobals() {
  if (started) return;
  started = true;
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion = media.matches;
  media.addEventListener("change", (e) => {
    reducedMotion = e.matches;
    for (const p of players) p.refresh();
    ensureLoop();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopLoop();
    else ensureLoop();
  });
  window.addEventListener(
    "pointermove",
    (e) => {
      // a lifted finger would leave the eyes stuck on the last touch
      if (e.pointerType === "touch") return;
      pointer = { x: e.clientX, y: e.clientY };
    },
    { passive: true },
  );
  document.addEventListener("mouseout", (e) => {
    if (!e.relatedTarget) pointer = null;
  });
  window.addEventListener("blur", () => (pointer = null));
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const p = byElement.get(entry.target);
          if (p) p.setVisible(entry.isIntersecting);
        }
        ensureLoop();
      },
      { rootMargin: "48px" },
    );
  }
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(tick);
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  lastMs = 0;
}

function ensureLoop() {
  if (document.hidden || reducedMotion) return;
  for (const p of players) {
    if (p.wantsFrames()) {
      schedule();
      return;
    }
  }
}

function tick(ms: number) {
  raf = 0;
  // 60 fps cap on faster displays
  if (lastMs && ms - lastMs < FRAME_MS - 1.5) {
    schedule();
    return;
  }
  // bounded delta: after a pause the scene resumes instead of jumping ahead
  const dt = lastMs ? Math.min((ms - lastMs) / 1000, 0.064) : 0;
  lastMs = ms;
  let any = false;
  for (const p of players) {
    if (!p.wantsFrames()) continue;
    any = true;
    p.tick(ms, dt);
  }
  if (any && !document.hidden) schedule();
  else lastMs = 0;
}

export class AvatarPlayer {
  private character: ReturnType<typeof createCharacter>;
  private props: AvatarProps;
  private visible = true;
  private lastDraw = 0;
  private elapsed = 0;
  private still = false;

  constructor(
    private readonly svg: SVGSVGElement,
    props: AvatarProps,
  ) {
    startGlobals();
    this.props = props;
    this.character = createCharacter(svg, props);
    players.add(this);
    byElement.set(svg, this);
    observer?.observe(svg);
    this.refresh();
    ensureLoop();
  }

  destroy() {
    players.delete(this);
    observer?.unobserve(this.svg);
    byElement.delete(this.svg);
    this.character.destroy();
    this.svg.replaceChildren();
    if (!players.size) stopLoop();
  }

  update(next: AvatarProps) {
    const prev = this.props;
    this.props = next;
    // Entering or leaving T3, or switching between cut-out and painted eyes, rebuilds the character.
    if (
      (prev.shape !== next.shape && (prev.shape === "t3" || next.shape === "t3")) ||
      (next.shape !== "t3" && paintsEyes(prev.fill) !== paintsEyes(next.fill))
    ) {
      this.character.destroy();
      this.character = createCharacter(this.svg, next);
      this.still = false;
      this.refresh();
      ensureLoop();
      return;
    }
    this.character.setShape(avatarShape(next.shape));
    if (prev.fill !== next.fill && next.shape !== "t3") {
      this.character.setInk(next.fill);
      applyInk(this.svg, this.character, next.fill);
    }
    if (prev.size !== next.size) this.character.setSize(next.size);
    if (prev.state !== next.state)
      this.character.setState(characterState(next.state), { resetEyes: true });
    this.refresh();
    ensureLoop();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    this.lastDraw = 0;
    this.elapsed = 0;
  }

  wantsFrames() {
    return this.visible && !this.isStill();
  }

  private isStill() {
    return reducedMotion || !this.props.animate || this.props.size < STILL_BELOW;
  }

  refresh() {
    if (this.isStill()) {
      this.character.holdFrame();
      this.still = true;
    } else if (this.still) {
      // holdFrame freezes the engine; recreate it when motion is enabled again.
      this.character.destroy();
      this.character = createCharacter(this.svg, this.props);
      this.still = false;
    }
  }

  tick(ms: number, dt: number) {
    this.elapsed += dt;
    const interval = this.props.size >= 48 ? 0 : this.props.size >= 28 ? 1000 / 30 : 1000 / 12;
    if (this.lastDraw && ms - this.lastDraw < interval - 1.5) return;
    this.lastDraw = ms;
    this.character.setGazeTarget(this.props.size >= FOLLOW_MIN_SIZE ? pointer : null);
    this.character.step(this.elapsed);
    this.elapsed = 0;
  }
}
