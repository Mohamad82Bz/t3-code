import { describe, expect, it } from "@effect/vitest";
import { codexFileChangeStats } from "./codexFileChange.ts";

describe("codexFileChangeStats", () => {
  it("counts the plain contents delivered for new files", () => {
    const diff =
      Array.from({ length: 20 }, (_, index) => `Line ${index + 1}: original`).join("\n") + "\n";
    expect(codexFileChangeStats([{ kind: { type: "add" }, diff }])).toEqual({
      additions: 20,
      deletions: 0,
    });
  });

  it.each([
    ["", 0],
    ["one", 1],
    ["one\n", 1],
    ["\n", 1],
    ["one\n\n", 2],
    ["one\r\ntwo\r\n", 2],
    ["@@ -1 +1 @@\n-old\n+new\n", 3],
  ])("counts whole-file lines without parsing content as a patch: %j", (diff, lines) => {
    expect(codexFileChangeStats([{ kind: { type: "add" }, diff }])).toEqual({
      additions: lines,
      deletions: 0,
    });
    expect(codexFileChangeStats([{ kind: { type: "delete" }, diff }])).toEqual({
      additions: 0,
      deletions: lines,
    });
  });

  it("leaves a mixed operation uncounted when an update is incomplete", () => {
    expect(
      codexFileChangeStats([
        { kind: { type: "add" }, diff: "new\n" },
        { kind: { type: "update" }, diff: "@@ -1 +1,2 @@\n-old\n+new\n" },
      ]),
    ).toBeUndefined();
  });
});
