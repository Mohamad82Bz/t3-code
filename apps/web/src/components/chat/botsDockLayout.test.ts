import { describe, expect, it } from "vite-plus/test";
import { resolveBotsDockLayout } from "./botsDockLayout";

const canvas = { width: 1_664, height: 1_028, chatLeft: 420, preview: null };

describe("Bots dock placement", () => {
  it("uses the upper-left gutter without expanding into the conversation", () => {
    expect(resolveBotsDockLayout(canvas)).toEqual({ inline: true, width: 280 });
    expect(resolveBotsDockLayout({ ...canvas, chatLeft: 224 })).toEqual({
      inline: true,
      width: 200,
    });
    expect(resolveBotsDockLayout({ ...canvas, chatLeft: 100 })).toEqual({ inline: false });
    expect(resolveBotsDockLayout({ ...canvas, width: 380, chatLeft: 0 })).toEqual({
      inline: false,
    });
  });

  it("uses a popover when there isn't room above quotas or beside the preview", () => {
    expect(resolveBotsDockLayout({ ...canvas, height: 600 })).toEqual({ inline: false });
    expect(
      resolveBotsDockLayout({ ...canvas, preview: { x: 60, y: 12, width: 280, height: 300 } }),
    ).toEqual({ inline: false });
    expect(
      resolveBotsDockLayout({ ...canvas, preview: { x: 0, y: 0, width: 280, height: 300 } }),
    ).toBeNull();
  });
});
