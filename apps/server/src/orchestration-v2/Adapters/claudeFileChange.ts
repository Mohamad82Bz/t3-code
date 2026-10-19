import { fileChangeStats } from "@t3tools/shared/fileChangeStats";
import { field } from "../unknownField.ts";

export function claudeFileChangeStats(output: unknown) {
  if (field(output, "staged") === true) return undefined;
  if (typeof output === "string") return fileChangeStats(output);

  const hunks = field(output, "structuredPatch");
  if (Array.isArray(hunks) && hunks.length > 0) {
    const patches: string[] = [];
    for (const hunk of hunks) {
      const oldStart = field(hunk, "oldStart");
      const oldLines = field(hunk, "oldLines");
      const newStart = field(hunk, "newStart");
      const newLines = field(hunk, "newLines");
      const lines = field(hunk, "lines");
      if (
        ![oldStart, oldLines, newStart, newLines].every(
          (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
        ) ||
        !Array.isArray(lines) ||
        !lines.every((line): line is string => typeof line === "string")
      )
        return undefined;
      patches.push(
        `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@\n${lines.join("\n")}\n`,
      );
    }
    return fileChangeStats(patches.join("\n"));
  }

  // An update with no patch may be a diff timeout, not a zero-line edit.
  const content = field(output, "content");
  if (field(output, "type") === "create" && typeof content === "string") {
    return {
      additions: content === "" ? 0 : content.split("\n").length - (content.endsWith("\n") ? 1 : 0),
      deletions: 0,
    };
  }
  return undefined;
}
