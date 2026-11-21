import { describe, expect, it } from "vite-plus/test";
import { decodeBotAvatarDefinition } from "./botAvatarDefinition.ts";

const apple = {
  version: 1,
  id: "apple",
  name: "Apple",
  body: { path: "M50 14 A36 36 0 1 1 49.99 14 Z" },
  eyes: { x: 50, y: 52, scale: 1, spacing: 17 },
};

describe("Open Bot Avatar import", () => {
  it("keeps drawing geometry without accepting SVG markup or out-of-bounds eye values", () => {
    expect(decodeBotAvatarDefinition(JSON.stringify(apple))).toEqual(apple);
    expect(
      decodeBotAvatarDefinition(JSON.stringify({ ...apple, body: { path: '<svg onload="go()" />' } })),
    ).toBeUndefined();
    expect(
      decodeBotAvatarDefinition(JSON.stringify({ ...apple, eyes: { ...apple.eyes, x: 400 } })),
    ).toBeUndefined();
  });
});
