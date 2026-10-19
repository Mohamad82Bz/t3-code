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
    "diff --git a/next.txt b/next.txt\nindex 1234567..abcdef0 100644\n",
    "--- a/next.txt\n+++ b/next.txt\n",
    "diff --git a/next.txt b/next.txt\n--- a/next.txt\n+++ b/next.txt\n",
  ])("rejects a header-only file section after a complete hunk: %s", (headers) => {
    const complete =
      "diff --git a/demo.txt b/demo.txt\n--- a/demo.txt\n+++ b/demo.txt\n@@ -1 +1 @@\n-old\n+new\n";
    expect(fileChangeStats(complete + headers)).toBeUndefined();
    expect(fileChangeStats(complete + headers + "@@ -0,0 +1 @@\n+next\n")).toEqual({
      additions: 2,
      deletions: 1,
    });
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
