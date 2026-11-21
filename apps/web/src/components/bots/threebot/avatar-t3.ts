// @ts-nocheck -- Vendor animation geometry uses fixed-length point arrays without tuple annotations.
import type { CharacterParts } from "./engine.ts";

// The skin shares the engine clock so clouds and face weather obey the same visibility policy.
const CENTER = 114.27;
const VIEW_HALF = 125.7;
const CLOUD_FLOAT =
  "M7 23.5C7 18.9 10.8 15.2 15.5 15.2C16.9 10.7 21.1 7.5 26.1 7.5C31 7.5 35.2 10.5 36.7 14.8C38.5 13.2 40.9 12.2 43.5 12.2C49.1 12.2 53.7 16.4 54.1 21.8C57 22.2 59.2 24 60 26.5H8.2C7.4 25.7 7 24.7 7 23.5Z";

// The valley: walls climb toward the rim and open around the face. Each puff is
// [x, y, radius]; puffs nearer the centre sit behind their outer neighbours.
const PUFFS = {
  far: [
    [126, 158, 15],
    [150, 146, 18],
    [101, 148, 17],
    [177, 122, 22],
    [75, 126, 21],
    [205, 100, 24],
    [46, 98, 24],
    [232, 84, 22],
    [16, 76, 24],
  ],
  middle: [
    [128, 178, 17],
    [150, 172, 20],
    [105, 170, 20],
    [178, 152, 27],
    [83, 151, 28],
    [212, 130, 33],
    [47, 124, 33],
    [8, 108, 38],
    [247, 112, 26],
  ],
  near: [
    [136, 224, 20],
    [110, 216, 24],
    [164, 208, 30],
    [76, 200, 30],
    [203, 174, 36],
    [2, 166, 52],
    [241, 151, 30],
  ],
};
const OVERCAST = [
  [-6, -8, 30],
  [36, -14, 34],
  [84, -8, 30],
  [130, -16, 36],
  [178, -8, 31],
  [226, -12, 32],
];
const TWINKLES = [
  [59, 47, 9.5],
  [100, 22, 6.5],
  [174, 27, 3.8],
  [197, 76, 3.2],
  [29, 92, 3],
];

const CALM = {
  speed: 1,
  billow: 1,
  tide: 0,
  part: 0,
  light: 1,
  sparkle: 1,
  storm: 0,
  ember: 0,
  moon: 0,
  shower: 0,
  glyph: 0,
  chorus: 0,
  beacon: 0,
  aurora: 0,
};
// Busy skies used to spin a status ring on small avatars; the states themselves act out
// the work now, so the rim only lights up red for a failure.
const BUSY = { speed: 1.35, billow: 1.15, tide: -5, part: 5, light: 1.1, sparkle: 1.2 };
const JOY = { speed: 1.5, billow: 1.8, tide: -9, part: 8, light: 1.25, sparkle: 1.6 };
const SLEEP = {
  speed: 0.28,
  billow: 0.45,
  tide: 34,
  part: -14,
  light: 0.62,
  sparkle: 0.42,
  moon: 1,
};
const GLOOM = {
  speed: 0.7,
  billow: 0.7,
  tide: 12,
  part: -4,
  light: 0.74,
  sparkle: 0.5,
  storm: 0.5,
};
const STORM = { speed: 1.3, billow: 1.3, tide: 8, part: -3, light: 0.6, sparkle: 0.2, storm: 1 };
type Weather = typeof CALM;
const WEATHER: Record<string, Partial<Weather>> = {
  sleeping: SLEEP,
  drowsy: { ...SLEEP, tide: 20, speed: 0.4 },
  "powering-down": { ...SLEEP, sparkle: 0.1, light: 0.5 },
  happy: JOY,
  playful: JOY,
  bouncing: JOY,
  laughing: JOY,
  excited: { ...JOY, shower: 1 },
  celebrate: { ...JOY, shower: 1 },
  proud: { ...JOY, aurora: 0.7, billow: 1.2 },
  humming: { ...JOY, speed: 1, chorus: 0.5 },
  thinking: BUSY,
  working: { ...BUSY, speed: 1.7, aurora: 1 },
  spawning: { ...BUSY, sparkle: 1.5 },
  searching: { ...BUSY, aurora: 0.7 },
  writing: BUSY,
  loading: BUSY,
  orbit: BUSY,
  radar: BUSY,
  progress: BUSY,
  sending: BUSY,
  receiving: BUSY,
  uploading: BUSY,
  listening: { chorus: 0.4 },
  dictating: { ...BUSY, chorus: 1 },
  notifying: { beacon: 1 },
  sad: GLOOM,
  bored: { ...GLOOM, storm: 0.2 },
  confused: { ...GLOOM, storm: 0, tide: 4 },
  angry: { ...STORM, ember: 1 },
  scared: STORM,
  alerting: { ...STORM, ember: 0.6 },
};
// Comet paths for the full-face busy states; folded states have the engine's glyphs.
const ROUTES: Record<string, string | undefined> = { working: "sweep", searching: "sweep" };

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
const fract = (n: number) => n - Math.floor(n);
const scatter = (n: number) => fract(Math.sin(n * 127.1) * 43758.5453);

type Point = { x: number; y: number };
type Attrs = Record<string, string | number>;
// [offset, color, opacity]
type Stop = [number, string, number?];
type CloudName = keyof typeof PUFFS;
interface Puff {
  el: SVGCircleElement;
  x: number;
  y: number;
  r: number;
  depth: number;
  phase: number;
  drift: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  dx: number;
  dy: number;
}

export function decorateT3Avatar(svg: SVGSVGElement, { body, eyes }: CharacterParts) {
  const document = svg.ownerDocument;
  const defs = svg.querySelector("defs");
  // The engine always draws its clip path first.
  const clip = svg.querySelector("clipPath")!;
  const prefix = `${clip.id}-t3`;
  const node = <K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Attrs,
    parent?: Node | null,
  ): SVGElementTagNameMap[K] => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    parent?.appendChild(el);
    return el;
  };
  const gradient = (
    tag: "radialGradient" | "linearGradient",
    name: string,
    attrs: Attrs,
    stops: Stop[],
  ) => {
    const el = node(tag, { id: `${prefix}-${name}`, ...attrs }, defs);
    for (const [offset, color, opacity = 1] of stops)
      node("stop", { offset, "stop-color": color, "stop-opacity": opacity }, el);
    return `url(#${el.id})`;
  };
  const radial = (name: string, attrs: Attrs, stops: Stop[]) =>
    gradient("radialGradient", name, attrs, stops);
  const linear = (name: string, attrs: Attrs, stops: Stop[]) =>
    gradient("linearGradient", name, attrs, stops);
  const sky = linear("sky", { x1: "8%", y1: "0%", x2: "86%", y2: "100%" }, [
    [0, "#07152F"],
    [0.5, "#151443"],
    [1, "#32155B"],
  ]);
  const skyLight = radial("sky-light", { cx: "68%", cy: "21%", r: "68%" }, [
    [0, "#5165D8", 0.42],
    [0.5, "#283075", 0.16],
    [1, "#111635", 0],
  ]);
  const valleyLight = radial("valley-light", { cx: "54%", cy: "78%", r: "58%" }, [
    [0, "#a06df0", 0.5],
    [0.55, "#6646B6", 0.17],
    [1, "#352066", 0],
  ]);
  const emberLight = radial("ember-light", { cx: "50%", cy: "92%", r: "70%" }, [
    [0, "#ff5a6e", 0.8],
    [0.6, "#b02a6a", 0.32],
    [1, "#3a1050", 0],
  ]);
  // Banks are one soft mass: lobes lift gently at the crest and settle to a shared
  // base tone by mid-height, so they layer without reading as separate spheres.
  const CLOUD_BASE = { far: "#29296c", middle: "#413499", near: "#6048bf" };
  const crest = (name: CloudName, tip: string, mid: string) =>
    linear(`crest-${name}`, { x1: 0, y1: 0, x2: 0, y2: 1 }, [
      [0, tip],
      [0.2, mid],
      [0.56, CLOUD_BASE[name]],
    ]);
  const puffFills = {
    far: crest("far", "#36357f", "#2f2e76"),
    middle: crest("middle", "#5c4ec0", "#4c3faa"),
    near: crest("near", "#927ae5", "#7661d3"),
  };
  const auroraFills = (
    [
      ["#6d9bff", 0.62],
      ["#a578ff", 0.5],
      ["#d08cf7", 0.4],
    ] as const
  ).map(([color, opacity], i) =>
    linear(`aurora-${i}`, { gradientUnits: "userSpaceOnUse", x1: 0, y1: 0, x2: 0, y2: 112 }, [
      [0.1, color, 0],
      [0.7, color, opacity * 0.34],
      [1, color, opacity],
    ]),
  );
  const starHalo = radial("star-halo", {}, [
    [0, "#ffffff", 0.8],
    [0.18, "#d5ddff", 0.22],
    [1, "#b9c5ff", 0],
  ]);
  const moonHalo = radial("moon-halo", {}, [
    [0.3, "#cfd6ff", 0.32],
    [1, "#8c8ef2", 0],
  ]);
  const meteorTail = linear("meteor", { x1: "0%", x2: "100%", y1: "0%", y2: "0%" }, [
    [0, "#af9bff", 0],
    [0.65, "#c6cfff", 0.35],
    [1, "#ffffff", 0.95],
  ]);
  const flashFill = radial("flash", { cx: "50%", cy: "30%", r: "72%" }, [
    [0, "#e9e6ff", 0.95],
    [0.6, "#a79bff", 0.45],
    [1, "#6a5cff", 0],
  ]);

  // The engine owns these shapes; a scoped sheet recolours them untouched.
  const glyphInk = linear("glyph", { x1: "0%", y1: "0%", x2: "100%", y2: "100%" }, [
    [0, "#e6e9ff"],
    [0.5, "#b7a6ff"],
    [1, "#8f7bf0"],
  ]);
  for (const layer of svg.querySelectorAll(":scope > g[aria-hidden]"))
    layer.setAttribute("data-t3-fx", "");
  node("style", {}, defs).textContent =
    `[data-t3-fx] stop:nth-child(odd){stop-color:#8d9bff}[data-t3-fx] stop:nth-child(even){stop-color:#e7d9ff}[data-t3-fx] rect{fill:#b7a6ff}[data-t3-fx] circle[fill]:not([fill="none"]){fill:#e6e9ff}[data-t3-fx] path[fill^="#"]{fill:#ffffff}`;
  svg.style?.setProperty("--fg", glyphInk);

  const planetGlow = radial("planet-glow", {}, [
    [0.34, "#a48cff", 0.5],
    [0.62, "#7a68e0", 0.14],
    [1, "#6a5cff", 0],
  ]);
  const halo = node("circle", {
    "data-layer": "planet-glow",
    cx: CENTER,
    cy: CENTER,
    r: 58,
    fill: planetGlow,
    opacity: 0,
  });
  body.parentNode!.insertBefore(halo, body);
  body.setAttribute("fill", sky);
  body.removeAttribute("stroke");
  for (const eye of eyes) eye.setAttribute("fill", "#ffffff");
  const scene = node("g", {
    "data-avatar-skin": "t3",
    "clip-path": `url(#${clip.id})`,
    "pointer-events": "none",
  });
  body.parentNode!.insertBefore(scene, body.nextSibling);
  const full = { x: -20, y: -20, width: 270, height: 270 };
  const skyGlow = node("rect", { "data-layer": "sky-glow", ...full, fill: skyLight }, scene);
  const valleyGlow = node(
    "rect",
    { "data-layer": "horizon-glow", ...full, fill: valleyLight },
    scene,
  );
  const emberGlow = node(
    "rect",
    { "data-layer": "ember-glow", ...full, fill: emberLight, opacity: 0 },
    scene,
  );

  // Twinkle is per group: cheap to drive and indistinguishable from per-star.
  const starFields = [0, 1, 2, 3, 4, 5].map((i) => ({
    el: node("g", { "data-layer": `stars-${i}` }, scene),
    depth: i % 3,
    phase: i * 1.73,
    frequency: 0.5 + i * 0.17,
  }));
  for (let i = 0; i < 78; i++) {
    const x = 6 + fract(i * 0.6180339) * 216;
    const y = 5 + fract(i * 0.7548777) * 158;
    const r = 0.3 + scatter(i) ** 3 * 0.85;
    node(
      "circle",
      {
        "data-star": i,
        cx: x.toFixed(1),
        cy: y.toFixed(1),
        r: r.toFixed(2),
        fill: "#E4EAFF",
        opacity: (0.4 + scatter(i + 40) * 0.6).toFixed(2),
      },
      starFields[i % 6].el,
    );
  }
  const sparkleLayer = node("g", { "data-layer": "twinkles" }, scene);
  const twinkles = TWINKLES.map(([x, y, r], i) => {
    const el = node("g", { "data-sparkle": i }, sparkleLayer);
    node("circle", { r: r * 1.5, fill: starHalo }, el);
    node(
      "path",
      {
        d: `M0 ${-r}Q0.3 -0.3 ${r} 0Q0.3 0.3 0 ${r}Q-0.3 0.3 ${-r} 0Q-0.3 -0.3 0 ${-r}Z`,
        fill: "#F4F6FF",
      },
      el,
    );
    return { el, x, y, phase: i * 1.93 };
  });

  // Curtains hang from above the sky; only their rippling hems are defined.
  const auroraLayer = node("g", { "data-layer": "aurora", opacity: 0, display: "none" }, scene);
  const curtains = auroraFills.map((fill, i) => ({
    el: node("path", { "data-curtain": i, fill }, auroraLayer),
    hem: 82 + i * 11,
    phase: i * 2.1,
    pace: 0.5 + i * 0.14,
  }));

  const meteorLayer = node("g", { "data-layer": "meteors" }, scene);
  const meteors = [0, 1, 2, 3, 4].map((i) => {
    const el = node("g", { "data-meteor": i, opacity: 0 }, meteorLayer);
    node("path", { d: "M-38 -0.3Q-14 -0.8 0 0Q-14 0.8 -38 0.3Z", fill: meteorTail }, el);
    node("circle", { r: 3, fill: starHalo }, el);
    node("circle", { r: 0.6, fill: "#ffffff" }, el);
    return el;
  });

  // The comet lives in the sky behind every cloud, so nothing crosses the valley.
  const cometLayer = node("g", { "data-layer": "comet" }, scene);
  const trails = [
    [0.8, 0.28, 18],
    [1.5, 0.42, 11],
    [2.4, 0.75, 5],
  ].map(([width, opacity, length]) => ({
    el: node(
      "polyline",
      {
        fill: "none",
        stroke: "#cfd6ff",
        "stroke-width": width,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-opacity": opacity,
        points: "",
      },
      cometLayer,
    ),
    length,
  }));
  const cometSprite = node(
    "g",
    { "data-comet": "", opacity: 0, transform: "translate(118 240)" },
    cometLayer,
  );
  node("circle", { r: 11, fill: starHalo }, cometSprite);
  node(
    "path",
    { d: "M0 -6Q0.3 -0.3 6 0Q0.3 0.3 0 6Q-0.3 0.3 -6 0Q-0.3 -0.3 0 -6Z", fill: "#ffffff" },
    cometSprite,
  );

  const drifter = node("g", { "data-layer": "drifter" }, scene);
  const drifterVolume = node("g", { transform: "scale(1.15) translate(-32 -18)" }, drifter);
  node("path", { d: CLOUD_FLOAT, fill: "#5550b4" }, drifterVolume);

  const puffs: Puff[] = [];
  const buildClouds = (name: CloudName, depth: number) => {
    const layer = node("g", { "data-layer": `clouds-${name}` }, scene);
    const list = PUFFS[name];
    // The mass keeps the valley solid while its puffs billow independently.
    const outline = [...list].sort((a, b) => a[0] - b[0]);
    node(
      "path",
      {
        "data-cloud-mass": name,
        d: `M-40 270L-40 ${outline[0][1]}${outline.map(([x, y]) => `L${x} ${y}`).join("")}L270 ${outline.at(-1)![1]}L270 270Z`,
        fill: CLOUD_BASE[name],
      },
      layer,
    );
    list.forEach(([x, y, r], i) => {
      const el = node("circle", { "data-puff": `${name}-${i}`, r, fill: puffFills[name] }, layer);
      puffs.push({
        el,
        x,
        y,
        r,
        depth,
        phase: x * 0.036 + depth * 2.1,
        drift: scatter(i + depth * 13) * 6.28,
        ox: 0,
        oy: 0,
        vx: 0,
        vy: 0,
        dx: x,
        dy: y,
      });
    });
    return { layer, depth };
  };
  const skies = (
    [
      ["far", 0.3],
      ["middle", 0.6],
    ] as const
  ).map(([name, depth]) => buildClouds(name, depth));

  const lightning = node("g", { "data-layer": "lightning", opacity: 0 }, scene);
  node("rect", { ...full, fill: flashFill }, lightning);
  const bolt = node(
    "path",
    {
      fill: "none",
      stroke: "#f4f1ff",
      "stroke-width": 1.5,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    },
    lightning,
  );

  // Between the banks: lightning silhouettes the middle bank against the far one.
  scene.insertBefore(lightning, skies[1].layer);

  skies.push(buildClouds("near", 1));
  const shade = node(
    "rect",
    { "data-layer": "shade", ...full, fill: "#090a26", opacity: 0 },
    scene,
  );
  const overcast = node("g", { "data-layer": "overcast", opacity: 0 }, scene);
  for (const [cx, cy, r] of OVERCAST) node("circle", { cx, cy, r, fill: "#231d58" }, overcast);
  const moon = node(
    "g",
    { "data-layer": "moon", opacity: 0, transform: "translate(166 -30)" },
    scene,
  );
  node("circle", { r: 38, fill: moonHalo }, moon);
  node(
    "path",
    { d: "M3.5 -17A17.4 17.4 0 1 0 17.4 3.8A14 14 0 0 1 3.5 -17Z", fill: "#EEF0FF" },
    moon,
  );

  const beacon = node(
    "g",
    { "data-layer": "beacon", opacity: 0, transform: "translate(170 52)" },
    scene,
  );
  node("circle", { r: 24, fill: starHalo }, beacon);
  node(
    "path",
    { d: "M0 -17Q0.8 -0.8 17 0Q0.8 0.8 0 17Q-0.8 0.8 -17 0Q-0.8 -0.8 0 -17Z", fill: "#ffffff" },
    beacon,
  );

  const rim = node("g", { "data-layer": "rim", fill: "none" }, scene);
  // A stroke of the body path, unlike a gradient, follows every squash.
  const rimStrokes = [[2, 0.16]].map(([width, opacity]) =>
    node("path", { stroke: "#cfcaff", "stroke-width": width, "stroke-opacity": opacity }, rim),
  );
  const statusArc = node(
    "path",
    {
      "data-status-arc": "",
      stroke: "#ff6b7d",
      "stroke-width": 11,
      "stroke-linecap": "round",
      opacity: 0,
    },
    rim,
  );

  let time = 0;
  let stateTime = 0;
  let state = "idle";
  let route: string | null | undefined = ROUTES.idle;
  let target = { ...CALM };
  let motion = { ...CALM };
  let pointer: Point | null = null;
  let gaze = { x: 0, y: 0 };
  let rect: DOMRect | null = null;
  let rectAge = 1;
  let detailed = true;
  let compact = false;
  let scenic = true;
  let frozen = false;
  let bodyPath: string | null = null;
  let fold = 0;
  let strikeAt = 1.2;
  let strike = 0;
  let cometAlpha = 0;
  const comet = { x: 118, y: 240 };
  const history: string[] = [];

  // Only called once a measured rect is in hand.
  const toScene = (px: number, py: number) => [
    CENTER + ((px - rect!.left) / rect!.width - 0.5) * VIEW_HALF * 2,
    CENTER + ((py - rect!.top) / rect!.height - 0.5) * VIEW_HALF * 2,
  ];
  const curtainPath = ({ hem, phase, pace }: { hem: number; phase: number; pace: number }) => {
    const points: [number, number][] = [];
    for (let x = -24; x <= 252; x += 34.5)
      points.push([
        x,
        hem +
          Math.sin(x * 0.021 + time * pace + phase) * 15 +
          Math.sin(x * 0.053 - time * pace * 1.6 + phase * 2) * 6,
      ]);
    let d = `M-24 -24L${points[0][0]} ${points[0][1].toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1],
        [x1, y1] = points[i];
      d += `Q${x0} ${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`;
    }
    return `${d}L252 -24Z`;
  };

  const routePoint = () => {
    const t = stateTime;
    if (route === "sweep")
      return [CENTER + Math.sin(t * 0.85) * 84, 56 + Math.sin(t * 1.7) * 24, 1];
    return [comet.x, 236, 0];
  };

  const paintSky = () => {
    skyGlow.setAttribute(
      "transform",
      `translate(${(gaze.x * 3 + Math.sin(time * 0.13) * 2).toFixed(2)} ${(gaze.y * 2 + Math.sin(time * 0.17)).toFixed(2)})`,
    );
    skyGlow.setAttribute(
      "opacity",
      (motion.light * (0.86 + 0.08 * Math.sin(time * 0.31))).toFixed(3),
    );
    valleyGlow.setAttribute(
      "opacity",
      Math.min(1, motion.light * (0.82 + 0.14 * Math.sin(time * 0.4))).toFixed(3),
    );
    emberGlow.setAttribute(
      "opacity",
      (motion.ember * (0.82 + 0.18 * Math.sin(time * 1.3))).toFixed(3),
    );
    for (const field of starFields) {
      field.el.setAttribute(
        "transform",
        `translate(${(gaze.x * (1 + field.depth * 1.4)).toFixed(2)} ${(gaze.y * (0.8 + field.depth)).toFixed(2)})`,
      );
      field.el.setAttribute(
        "opacity",
        clamp(
          (0.72 + 0.28 * Math.sin(time * field.frequency + field.phase)) * motion.sparkle,
          0,
          1,
        ).toFixed(3),
      );
    }
    const boost = compact ? 1.7 : 1;
    for (const sparkle of twinkles) {
      const glint = (Math.sin(time * 1.1 + sparkle.phase) + 1) / 2;
      sparkle.el.setAttribute(
        "transform",
        `translate(${(sparkle.x + gaze.x * 4).toFixed(2)} ${(sparkle.y + gaze.y * 3).toFixed(2)}) rotate(${(Math.sin(time * 0.4 + sparkle.phase) * 7).toFixed(2)}) scale(${((0.76 + glint * 0.3 * motion.sparkle) * boost).toFixed(3)})`,
      );
      sparkle.el.setAttribute(
        "opacity",
        clamp((0.5 + glint * 0.5) * motion.sparkle, 0, 1).toFixed(3),
      );
    }
    for (let i = 0; i < meteors.length; i++) {
      const period = motion.shower > 0.4 ? 1.9 + i * 0.37 : i ? 0 : 21;
      const round = period ? Math.floor((stateTime + i * 0.61) / period) : 0;
      const elapsed = period
        ? ((stateTime + i * 0.61) % period) - (motion.shower > 0.4 ? 0 : 9)
        : -1;
      const active = detailed && !frozen && elapsed >= 0 && elapsed < 1.1;
      meteors[i].setAttribute(
        "opacity",
        active ? (Math.sin((elapsed / 1.1) * Math.PI) ** 2 * 0.9).toFixed(3) : "0",
      );
      if (active) {
        const u = elapsed / 1.1;
        meteors[i].setAttribute(
          "transform",
          `translate(${(lerp(-20, 150, u) + scatter(round + i * 7) * 110).toFixed(2)} ${(lerp(-10, 64, u) + scatter(round * 3 + i) * 62).toFixed(2)}) rotate(23)`,
        );
      }
    }
    const drift = ((205 + time * 1.3 + 60) % 340) - 60;
    drifter.setAttribute(
      "transform",
      `translate(${(drift + gaze.x * 6).toFixed(2)} ${(68 + motion.tide * 0.2 + Math.sin(time * 0.3) * 1.5 + gaze.y * 4).toFixed(2)})`,
    );
  };

  const paintClouds = (dt: number) => {
    for (const { layer, depth } of skies)
      layer.setAttribute(
        "transform",
        `translate(${(gaze.x * depth * 11).toFixed(2)} ${(gaze.y * depth * 7 + motion.tide * depth).toFixed(2)})`,
      );
    const wake = pointer && rect?.width ? toScene(pointer.x, pointer.y) : null;
    for (const puff of puffs) {
      // A swell rolls along the banks; each puff adds its own slow breath.
      const swell = Math.sin(time * 0.7 - puff.phase);
      const breath = Math.sin(time * (0.5 + puff.depth * 0.3) + puff.drift);
      const chorus =
        motion.chorus *
        puff.depth *
        Math.abs(
          Math.sin(stateTime * 5.4 + puff.x * 0.11) * Math.sin(stateTime * 3.3 + puff.x * 0.27),
        ) *
        15;
      const hop =
        Math.max(motion.billow - 1.5, 0) *
        Math.abs(Math.sin(stateTime * 3.2 - puff.phase)) *
        13 *
        puff.depth;
      puff.dx =
        puff.x +
        Math.sign(puff.x - CENTER) * motion.part * puff.depth +
        breath * 1.1 * motion.billow;
      puff.dy = puff.y + swell * (1.1 + puff.depth * 2.3) * motion.billow - chorus - hop;
      if (dt && detailed) {
        let tx = 0,
          ty = 0;
        if (wake) {
          // The pointer ploughs a wake through the clouds, and they spring back.
          const dx = puff.dx + puff.ox - wake[0] + gaze.x * puff.depth * 11;
          const dy = puff.dy + puff.oy - wake[1] + motion.tide * puff.depth;
          const distance = Math.hypot(dx, dy) || 1;
          const reach = puff.r + 30;
          if (distance < reach) {
            const force = (1 - distance / reach) ** 2 * 26;
            tx = (force * dx) / distance;
            ty = (force * dy) / distance;
          }
        }
        puff.vx += ((tx - puff.ox) * 64 - puff.vx * 9) * dt;
        puff.vy += ((ty - puff.oy) * 64 - puff.vy * 9) * dt;
        puff.ox += puff.vx * dt;
        puff.oy += puff.vy * dt;
      }
      const scale = 1 + breath * 0.022 * motion.billow;
      puff.el.setAttribute(
        "transform",
        `translate(${(puff.dx + puff.ox).toFixed(2)} ${(puff.dy + puff.oy).toFixed(2)}) scale(${scale.toFixed(4)})`,
      );
    }
  };

  const paintAurora = () => {
    const shown = scenic && motion.aurora > 0.01;
    auroraLayer.setAttribute("display", shown ? "inline" : "none");
    if (!shown) return;
    auroraLayer.setAttribute(
      "opacity",
      (motion.aurora * (0.82 + 0.18 * Math.sin(time * 0.9))).toFixed(3),
    );
    for (const curtain of curtains) curtain.el.setAttribute("d", curtainPath(curtain));
  };

  const paintComet = (dt: number) => {
    const [x, y, want] = routePoint();
    const away = route === "launch" || route === "land";
    cometAlpha +=
      ((frozen ? 0 : want) - cometAlpha) * (dt ? 1 - Math.exp(-dt * (away ? 22 : 6)) : 1);
    const follow = away || cometAlpha < 0.02 ? 1 : dt ? 1 - Math.exp(-dt * 11) : 1;
    comet.x += (x - comet.x) * follow;
    comet.y += (y - comet.y) * follow;
    if (dt && cometAlpha > 0.02) {
      history.push(`${comet.x.toFixed(1)},${comet.y.toFixed(1)}`);
      if (history.length > 18) history.shift();
    } else if (history.length) history.length = 0;
    const visible = cometAlpha > 0.02 && !frozen;
    const boost = compact ? 1.75 : 1;
    cometSprite.setAttribute("opacity", visible ? cometAlpha.toFixed(3) : "0");
    cometSprite.setAttribute(
      "transform",
      `translate(${comet.x.toFixed(2)} ${comet.y.toFixed(2)}) scale(${boost})`,
    );
    for (const trail of trails)
      trail.el.setAttribute(
        "points",
        detailed && visible ? history.slice(-trail.length).join(" ") : "",
      );
  };

  const paintWeather = () => {
    const dim = clamp(1 - motion.light, 0, 1) * 1.05 + motion.storm * 0.12;
    shade.setAttribute("opacity", clamp(dim, 0, 0.72).toFixed(3));
    overcast.setAttribute("opacity", clamp(motion.storm * 1.4, 0, 1).toFixed(3));
    overcast.setAttribute(
      "transform",
      `translate(${(Math.sin(time * 0.5) * 5 + gaze.x * 3).toFixed(2)} ${(motion.storm * 34 - 26).toFixed(2)})`,
    );
    moon.setAttribute("opacity", clamp(motion.moon * 1.2, 0, 1).toFixed(3));
    moon.setAttribute(
      "transform",
      `translate(${(166 + gaze.x * 2).toFixed(2)} ${lerp(-30, 56, ease(clamp(motion.moon, 0, 1))).toFixed(2)})`,
    );
    // Single strikes several seconds apart: dramatic, and safe for flash sensitivity.
    const stormy = motion.storm > 0.75 && !frozen;
    if (stormy && stateTime > strikeAt) {
      strike = stateTime;
      strikeAt = stateTime + 3 + scatter(stateTime) * 3.5;
      let x = 62 + scatter(stateTime + 1) * 104,
        y = 8;
      let d = `M${x.toFixed(1)} ${y}`;
      for (let i = 0; i < 6; i++) {
        x += (scatter(stateTime + i * 3) - 0.5) * 26;
        y += 17;
        d += `L${x.toFixed(1)} ${y}`;
      }
      bolt.setAttribute("d", d);
    }
    const since = stateTime - strike;
    const flash =
      stormy && since < 0.42
        ? Math.max(1 - since / 0.14, 0) * 0.9 + Math.max(1 - Math.abs(since - 0.24) / 0.1, 0) * 0.55
        : 0;
    lightning.setAttribute("opacity", flash.toFixed(3));
    bolt.setAttribute("display", detailed ? "inline" : "none");
    beacon.setAttribute(
      "opacity",
      clamp(motion.beacon * (0.72 + 0.28 * Math.sin(stateTime * 4)), 0, 1).toFixed(3),
    );
    beacon.setAttribute(
      "transform",
      `translate(170 52) rotate(${(stateTime * 18).toFixed(1)}) scale(${((0.72 + 0.14 * Math.sin(stateTime * 4)) * (compact ? 1.5 : 1)).toFixed(3)})`,
    );
  };

  const paintRim = () => {
    // The engine paints the body path before the skin is attached.
    const path = body.getAttribute("d")!;
    if (path !== bodyPath) {
      bodyPath = path;
      for (const el of [...rimStrokes, statusArc]) el.setAttribute("d", path);
    }
    // Small avatars can't show the sky's storm, so their rim glows red for it instead.
    const alarm = compact && motion.ember > 0.3;
    const arc = alarm ? (1 - fold) * motion.ember * (0.7 + 0.3 * Math.sin(stateTime * 3.4)) : 0;
    statusArc.setAttribute("opacity", arc > 0.01 ? clamp(arc, 0, 1).toFixed(3) : "0");
    halo.setAttribute("opacity", (fold * (0.82 + 0.18 * Math.sin(stateTime * 2.2))).toFixed(3));
  };

  const paint = (dt: number) => {
    paintSky();
    paintClouds(dt);
    paintAurora();
    paintComet(dt);
    paintWeather();
    paintRim();
  };
  paint(0);

  return {
    step(seconds: number) {
      if (frozen) return;
      const dt = clamp(seconds, 0, 0.1);
      const blend = 1 - Math.exp(-dt * 2.6);
      for (const key of Object.keys(motion) as (keyof Weather)[])
        motion[key] += (target[key] - motion[key]) * blend;
      time += dt * motion.speed;
      stateTime += dt;
      rectAge += dt;
      if ((pointer || cometAlpha > 0.4) && rectAge > 0.2) {
        rect = svg.getBoundingClientRect();
        rectAge = 0;
      }
      const x =
        pointer && rect?.width ? clamp((pointer.x - rect.left) / rect.width - 0.5, -0.65, 0.65) : 0;
      const y =
        pointer && rect?.height
          ? clamp((pointer.y - rect.top) / rect.height - 0.5, -0.65, 0.65)
          : 0;
      const follow = 1 - Math.exp(-dt * 5);
      gaze.x += (x - gaze.x) * follow;
      gaze.y += (y - gaze.y) * follow;
      paint(dt);
    },
    holdFrame() {
      frozen = true;
      time = 0;
      stateTime = 0;
      cometAlpha = 0;
      motion = { ...target };
      gaze = { x: 0, y: 0 };
      history.length = 0;
      for (const puff of puffs) puff.ox = puff.oy = puff.vx = puff.vy = 0;
      paint(0);
    },
    setState(next: string) {
      if (state !== next) {
        stateTime = 0;
        strikeAt = 1.2;
        strike = -9;
      }
      state = next;
      route = ROUTES[next] ?? null;
      target = { ...CALM, ...WEATHER[next] };
    },
    setGazeTarget(point: Point | null) {
      pointer = point;
    },
    // 0 is the full face, 1 the engine's folded overlay body.
    setFold(amount: number) {
      fold = clamp(amount, 0, 1);
    },
    // The bot watches its comet unless a real pointer is around.
    eyeTarget(): Point | null {
      if (pointer) return pointer;
      if (cometAlpha < 0.4 || !rect?.width) return null;
      return {
        x: rect.left + ((comet.x - CENTER) / (VIEW_HALF * 2) + 0.5) * rect.width,
        y: rect.top + ((comet.y - CENTER) / (VIEW_HALF * 2) + 0.5) * rect.height,
      };
    },
    setSize(size: number) {
      detailed = size >= 64;
      compact = size < 64;
      rectAge = 1;
      scenic = size >= 40;
      meteorLayer.setAttribute("display", detailed ? "inline" : "none");
      scene
        .querySelector('[data-layer="clouds-far"]')!
        .setAttribute("display", scenic ? "inline" : "none");
      drifter.setAttribute("display", scenic ? "inline" : "none");
    },
  };
}
