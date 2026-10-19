import { parseDiffFromFile } from "@pierre/diffs";
import { NonNegativeInt, type OrchestrationV2TurnItem } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { getRenderablePatch } from "../../lib/diffRendering";

type FileChange = Extract<OrchestrationV2TurnItem, { type: "file_change" }>;

const decodeClaudeDiff = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      type: Schema.optional(Schema.String),
      content: Schema.optional(Schema.String),
      structuredPatch: Schema.optional(
        Schema.Array(
          Schema.Struct({
            oldStart: NonNegativeInt,
            oldLines: NonNegativeInt,
            newStart: NonNegativeInt,
            newLines: NonNegativeInt,
            lines: Schema.Array(Schema.String),
          }),
        ),
      ),
    }),
  ),
);

export function toolCallDiff(item: FileChange) {
  let patch = item.diffStr;
  if (item.nativeItemRef?.driver === "claudeAgent" && patch?.trimStart().startsWith("{")) {
    const decoded = decodeClaudeDiff(patch);
    if (Option.isNone(decoded) && patch.trimEnd().endsWith("… output truncated for transport")) {
      return {
        kind: "unavailable" as const,
        reason:
          "This tool-call diff was truncated before it was saved. Open the turn diff to inspect the file changes.",
      };
    }
    if (Option.isSome(decoded)) {
      const output = decoded.value;
      if (output.type === "create" && output.content !== undefined) {
        const file = parseDiffFromFile(
          { name: item.fileName, contents: "" },
          { name: item.fileName, contents: output.content },
        );
        return { kind: "files" as const, files: [file] };
      }
      if (output.structuredPatch?.length) {
        patch =
          `--- ${item.fileName}\n+++ ${item.fileName}\n` +
          output.structuredPatch
            .map(
              (hunk) =>
                `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n${hunk.lines.join("\n")}\n`,
            )
            .join("\n");
      }
    }
  }
  const change = item.changes?.length === 1 ? item.changes[0] : undefined;
  // Codex supplies whole-file contents for adds/deletes, even when they look like patch text.
  const wholeFile =
    item.nativeItemRef?.driver === "codex" &&
    (change?.operation === "add" || change?.operation === "delete");
  if (wholeFile || item.oldStr !== undefined || item.newStr !== undefined) {
    const oldContents = wholeFile
      ? change?.operation === "delete"
        ? (item.diffStr ?? "")
        : ""
      : (item.oldStr ?? "");
    const newContents = wholeFile
      ? change?.operation === "add"
        ? (item.diffStr ?? "")
        : ""
      : (item.newStr ?? "");
    const file = parseDiffFromFile(
      { name: change?.oldPath ?? item.fileName, contents: oldContents },
      { name: item.fileName, contents: newContents },
    );
    return { kind: "files" as const, files: [file] };
  }
  // Some providers send hunks without file headers.
  const withHeaders = patch?.startsWith("@@ ")
    ? `--- ${item.fileName}\n+++ ${item.fileName}\n${patch}`
    : patch;
  return getRenderablePatch(withHeaders, `tool-call:${item.id}`, {
    compactPartialHunkOffsets: true,
  });
}
