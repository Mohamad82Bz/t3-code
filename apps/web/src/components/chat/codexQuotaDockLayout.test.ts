import { describe, expect, it } from "vite-plus/test";
import { resolveCodexQuotaDockLayout } from "./codexQuotaDockLayout";

describe("Codex quota dock placement", () => {
  it("uses the bottom-left gutter without entering the conversation lane", () => {
    const dock = resolveCodexQuotaDockLayout({ width: 1674, height: 900, chatLeft: 453 });
    expect(dock).toEqual({ width: 240, maxHeight: 420, inline: true });
    expect(12 + dock!.width + 12).toBeLessThanOrEqual(453);
  });
  it("shrinks to the available gutter and collapses when panels leave no room", () => {
    expect(resolveCodexQuotaDockLayout({ width: 1200, height: 500, chatLeft: 228 })).toEqual({
      width: 204,
      maxHeight: 420,
      inline: true,
    });
    expect(resolveCodexQuotaDockLayout({ width: 1100, height: 500, chatLeft: 200 })?.inline).toBe(
      false,
    );
    expect(resolveCodexQuotaDockLayout({ width: 640, height: 200, chatLeft: 48 })).toEqual({
      width: 192,
      maxHeight: 176,
      inline: false,
    });
  });
  it("does not add a dock to phone-sized or very short canvases", () => {
    expect(resolveCodexQuotaDockLayout({ width: 639, height: 900, chatLeft: 48 })).toBeNull();
    expect(resolveCodexQuotaDockLayout({ width: 1600, height: 159, chatLeft: 416 })).toBeNull();
  });
  it("collapses instead of overlapping a preview dragged into the same space", () => {
    const canvas = { width: 1674, height: 900, chatLeft: 453 };
    expect(
      resolveCodexQuotaDockLayout({
        ...canvas,
        preview: { x: 12, y: 600, width: 300, height: 280 },
      })?.inline,
    ).toBe(false);
    expect(
      resolveCodexQuotaDockLayout({
        ...canvas,
        preview: { x: 1200, y: 600, width: 300, height: 280 },
      })?.inline,
    ).toBe(true);
  });
});
