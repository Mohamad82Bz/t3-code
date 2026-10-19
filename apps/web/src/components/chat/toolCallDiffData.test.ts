import { ProviderDriverKind, ThreadId, TurnItemId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { getDiffLineStat } from "../../lib/diffRendering";
import { toolCallDiff } from "./toolCallDiffData";

const item = {
  id: TurnItemId.make("edit-1"),
  threadId: ThreadId.make("thread-1"),
  runId: null,
  nodeId: null,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: 0,
  status: "completed" as const,
  title: null,
  startedAt: null,
  completedAt: null,
  updatedAt: DateTime.makeUnsafe("2026-10-19T00:00:00Z"),
  type: "file_change" as const,
  fileName: "demo.txt",
};

describe("tool-call diffs", () => {
  it("renders Claude Write payloads and Edit hunks at their original line numbers", () => {
    const nativeItemRef = {
      driver: ProviderDriverKind.make("claudeAgent"),
      nativeId: "1",
      strength: "strong" as const,
    };
    const created = toolCallDiff({
      ...item,
      nativeItemRef,
      diffStr: JSON.stringify({ type: "create", content: "one\ntwo\n", structuredPatch: [] }),
    });
    if (created?.kind !== "files") throw new Error("Expected created file diff");
    expect(getDiffLineStat(created.files)).toEqual({ additions: 2, deletions: 0 });
    const edited = toolCallDiff({
      ...item,
      nativeItemRef,
      diffStr: JSON.stringify({
        structuredPatch: [
          {
            oldStart: 56,
            oldLines: 2,
            newStart: 56,
            newLines: 2,
            lines: [" context", "-old", "+new"],
          },
        ],
      }),
    });
    if (edited?.kind !== "files") throw new Error("Expected edit diff");
    expect(getDiffLineStat(edited.files)).toEqual({ additions: 1, deletions: 1 });
    expect(edited.files[0]?.hunks[0]).toMatchObject({ additionStart: 56, deletionStart: 56 });
  });

  it("renders both full patches and headerless edit hunks", () => {
    for (const prefix of ["", "--- demo.txt\n+++ demo.txt\n"]) {
      const diff = toolCallDiff({
        ...item,
        diffStr: `${prefix}@@ -1 +1,2 @@\n-old\n+new\n+extra\n`,
      });
      expect(diff?.kind).toBe("files");
      if (diff?.kind !== "files") throw new Error("Expected parsed diff");
      expect(getDiffLineStat(diff.files)).toEqual({ additions: 2, deletions: 1 });
    }
  });

  it("treats Codex creates and deletes as whole files even when they contain patch syntax", () => {
    for (const operation of ["add", "delete"] as const) {
      const diff = toolCallDiff({
        ...item,
        nativeItemRef: {
          driver: ProviderDriverKind.make("codex"),
          nativeId: "1",
          strength: "strong",
        },
        changes: [{ operation, path: "demo.txt" }],
        diffStr: "--- literal header\n+++ literal text\n@@ not a patch\n",
      });
      if (diff?.kind !== "files") throw new Error("Expected parsed diff");
      expect(getDiffLineStat(diff.files)).toEqual({
        additions: operation === "add" ? 3 : 0,
        deletions: operation === "delete" ? 3 : 0,
      });
    }
  });

  it("supports before/after text, including an empty new file", () => {
    const diff = toolCallDiff({ ...item, oldStr: "old\n", newStr: "new\n" });
    if (diff?.kind !== "files") throw new Error("Expected parsed diff");
    expect(getDiffLineStat(diff.files)).toEqual({ additions: 1, deletions: 1 });
    expect(toolCallDiff({ ...item, newStr: "" })?.kind).toBe("files");
  });

  it("keeps unsupported output readable and handles unavailable history", () => {
    expect(toolCallDiff({ ...item, diffStr: "unsupported provider output" })).toMatchObject({
      kind: "raw",
      text: "unsupported provider output",
    });
    expect(toolCallDiff(item)).toBeNull();
  });
});
