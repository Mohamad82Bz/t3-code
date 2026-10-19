import { describe, expect, it } from "vite-plus/test";
import { claudeFileChangeDiff, claudeFileChangeStats } from "./claudeFileChange.ts";

describe("claudeFileChangeDiff", () => {
  it("retains small edit hunks without copying the original file into the diff", () => {
    const output = {
      filePath: "/repo/large.ts",
      oldString: "old",
      newString: "new",
      originalFile: "original file context\n".repeat(10_000),
      structuredPatch: [
        {
          oldStart: 1640,
          oldLines: 2,
          newStart: 1640,
          newLines: 2,
          lines: [" context", "-old", "+new"],
        },
      ],
    };
    const expected = "@@ -1640,2 +1640,2 @@\n context\n-old\n+new\n";
    expect(claudeFileChangeDiff(output)).toBe(expected);
    expect(claudeFileChangeDiff(JSON.stringify(output))).toBe(expected);
    expect(claudeFileChangeStats(output)).toEqual({ additions: 1, deletions: 1 });
  });

  it("writes standalone patches for new files, including missing final newlines", () => {
    expect(claudeFileChangeDiff({ type: "create", content: "one\ntwo" })).toBe(
      "@@ -0,0 +1,2 @@\n+one\n+two\n\\ No newline at end of file\n",
    );
    expect(claudeFileChangeDiff({ type: "create", content: "" })).toBe("@@ -0,0 +0,0 @@\n");
    expect(claudeFileChangeDiff("provider error")).toBe("provider error");
    expect(
      claudeFileChangeDiff({ type: "update", content: "unknown", structuredPatch: [] }),
    ).toBeUndefined();
  });
});

describe("claudeFileChangeStats", () => {
  it("counts actual structured edit hunks, including repeated replacements", () => {
    expect(
      claudeFileChangeStats({
        structuredPatch: [
          {
            oldStart: 1,
            oldLines: 2,
            newStart: 1,
            newLines: 3,
            lines: ["-old", "+new", "+extra", " context"],
          },
          { oldStart: 20, oldLines: 1, newStart: 21, newLines: 1, lines: ["-old", "+new"] },
        ],
        gitDiff: { additions: 100, deletions: 90 },
      }),
    ).toEqual({ additions: 3, deletions: 2 });
  });

  it.each([
    ["", 0],
    ["one", 1],
    ["one\n", 1],
    ["one\r\ntwo\r\n", 2],
  ] as const)("counts a confirmed new file: %j", (content, additions) => {
    expect(claudeFileChangeStats({ type: "create", content, structuredPatch: [] })).toEqual({
      additions,
      deletions: 0,
    });
  });

  it.each([
    { type: "update", content: "replacement", originalFile: null, structuredPatch: [] },
    { type: "create", content: "proposed", staged: true },
    {
      structuredPatch: [
        { oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ["-old", "+new"] },
      ],
    },
    { old_string: "old", new_string: "new", replace_all: true },
  ])("does not guess counts for unavailable or unapplied edits: %j", (output) => {
    expect(claudeFileChangeStats(output)).toBeUndefined();
  });
});
