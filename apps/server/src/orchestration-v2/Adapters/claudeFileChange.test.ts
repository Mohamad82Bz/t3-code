import { describe, expect, it } from "vite-plus/test";
import { claudeFileChangeStats } from "./claudeFileChange.ts";

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
