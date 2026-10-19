import { fileChangeStats } from "@t3tools/shared/fileChangeStats";
import { field } from "../unknownField.ts";

export function claudeFileChangeDiff(output: unknown): string | undefined {
  if (typeof output === "string") {
    if (!output.trimStart().startsWith("{")) return output;
    try {
      return claudeFileChangeDiff(JSON.parse(output));
    } catch {
      return output;
    }
  }
  if (field(output, "staged") === true) return undefined;

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
    return patches.join("\n");
  }

  // An update with no patch may be a diff timeout, not a zero-line edit.
  const content = field(output, "content");
  if (field(output, "type") === "create" && typeof content === "string") {
    const lines = content === "" ? [] : content.split("\n");
    if (content.endsWith("\n")) lines.pop();
    return [
      `@@ -0,0 +${lines.length > 0 ? 1 : 0},${lines.length} @@`,
      ...lines.map((line) => `+${line}`),
      ...(content && !content.endsWith("\n") ? ["\\ No newline at end of file"] : []),
      "",
    ].join("\n");
  }
  return undefined;
}

export function claudeFileChangeStats(output: unknown) {
  return fileChangeStats(claudeFileChangeDiff(output));
}
