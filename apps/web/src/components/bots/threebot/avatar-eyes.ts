import type { CharacterParts } from "./engine.ts";

// Keep the reference's animated eye paths, using them as cutouts so avatars fit
// the sidebar, chat, hover surfaces and both themes without a painted eye color.
export function cutoutEyes(svg: SVGSVGElement, { body, eyes }: CharacterParts) {
  const ns = "http://www.w3.org/2000/svg";
  const document = svg.ownerDocument;
  const mask = document.createElementNS(ns, "mask");
  mask.id = `${svg.querySelector("clipPath")!.id}-eyes`;
  for (const [name, value] of Object.entries({
    maskUnits: "userSpaceOnUse",
    x: -1000,
    y: -1000,
    width: 3000,
    height: 3000,
  })) {
    mask.setAttribute(name, String(value));
  }
  const background = document.createElementNS(ns, "rect");
  for (const [name, value] of Object.entries({
    x: -1000,
    y: -1000,
    width: 3000,
    height: 3000,
    fill: "white",
  })) {
    background.setAttribute(name, String(value));
  }
  mask.appendChild(background);
  for (const eye of eyes) {
    eye.setAttribute("fill", "black");
    mask.appendChild(eye);
  }
  svg.querySelector("defs")!.appendChild(mask);
  body.setAttribute("mask", `url(#${mask.id})`);
}
