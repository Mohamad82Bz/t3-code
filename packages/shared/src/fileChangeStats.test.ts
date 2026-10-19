import { describe, expect, it } from "vite-plus/test";
import { fileChangeStats } from "./fileChangeStats.ts";

describe("fileChangeStats", () => {
  it("counts creation, replacement, and removal independently of context and headers", () => {
    const create = `--- /dev/null\n+++ demo.txt\n@@ -0,0 +1,20 @@\n${Array.from({ length: 20 }, (_, i) => `+line ${i}`).join("\n")}\n`;
    const edit = `@@ -1,11 +1,11 @@\n${Array.from({ length: 10 }, (_, i) => `-old ${i}`).join("\n")}\n${Array.from({ length: 10 }, (_, i) => `+new ${i}`).join("\n")}\n context\n`;
    const remove = "@@ -15,6 +15 @@\n context\n-a\n-b\n-c\n-d\n-e\n";
    expect(fileChangeStats(create)).toEqual({ additions: 20, deletions: 0 });
    expect(fileChangeStats(edit)).toEqual({ additions: 10, deletions: 10 });
    expect(fileChangeStats(remove)).toEqual({ additions: 0, deletions: 5 });
    expect(fileChangeStats([create, edit, remove].join("\n"))).toEqual({
      additions: 30,
      deletions: 15,
    });
  });

  it("counts content that resembles headers and handles CRLF and missing final newlines", () => {
    expect(
      fileChangeStats(
        "--- a\r\n+++ a\r\n@@ -1 +1 @@\r\n--- literal\r\n+++ literal\r\n\\ No newline at end of file\r\n",
      ),
    ).toEqual({ additions: 1, deletions: 1 });
  });

  it.each([
    undefined,
    "Success. Updated file.",
    "--- a\n+++ a\n",
    "@@ -1,2 +1,2 @@\n-old\n+new\n",
    "@@ -1 +0,0 @@\n context\n",
    "@@ -0,0 +1 @@\n+text\nBinary files a and b differ\n",
    "GIT binary patch\n",
    "@@@ -1 -1 +1 @@@\n",
    "@@ -0,0 +1 @@\n+complete hunk\n… output truncated for transport",
  ])("leaves unknown or incomplete changes uncounted: %s", (patch) => {
    expect(fileChangeStats(patch)).toBeUndefined();
  });
});
