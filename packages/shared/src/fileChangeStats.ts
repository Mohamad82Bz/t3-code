const PATCH_METADATA_PREFIXES = [
  "diff --git ",
  "index ",
  "--- ",
  "+++ ",
  "old mode ",
  "new mode ",
  "new file mode ",
  "deleted file mode ",
  "rename from ",
  "rename to ",
  "copy from ",
  "copy to ",
  "similarity index ",
  "dissimilarity index ",
  "Index: ",
];

/** Unknown or incomplete patches must not appear as successful zero-line edits. */
export function fileChangeStats(patch: string | undefined) {
  if (patch === undefined) return undefined;
  let additions = 0;
  let deletions = 0;
  let oldRemaining = 0;
  let newRemaining = 0;
  let sawHunk = false;
  let currentFileHasHunk = false;

  for (const line of patch.split(/\r?\n/)) {
    const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
    if (hunk) {
      if (oldRemaining !== 0 || newRemaining !== 0) return undefined;
      oldRemaining = Number(hunk[1] ?? 1);
      newRemaining = Number(hunk[2] ?? 1);
      if (!Number.isSafeInteger(oldRemaining) || !Number.isSafeInteger(newRemaining)) {
        return undefined;
      }
      sawHunk = true;
      currentFileHasHunk = true;
      continue;
    }
    if (line.startsWith("Binary files ") || line === "GIT binary patch" || line.startsWith("@@@")) {
      return undefined;
    }
    if (oldRemaining === 0 && newRemaining === 0) {
      if (
        line.startsWith("diff --git ") ||
        line.startsWith("Index: ") ||
        line.startsWith("--- ") ||
        line.startsWith("+++ ")
      ) {
        currentFileHasHunk = false;
      }
      if (
        line === "" ||
        line === "\\ No newline at end of file" ||
        /^={3,}$/.test(line) ||
        PATCH_METADATA_PREFIXES.some((prefix) => line.startsWith(prefix))
      )
        continue;
      return undefined;
    }
    if (line.startsWith("\\ No newline at end of file")) continue;
    switch (line[0]) {
      case "+":
        additions++;
        newRemaining--;
        break;
      case "-":
        deletions++;
        oldRemaining--;
        break;
      case " ":
        oldRemaining--;
        newRemaining--;
        break;
      default:
        return undefined;
    }
    if (oldRemaining < 0 || newRemaining < 0) return undefined;
  }

  return sawHunk && currentFileHasHunk && oldRemaining === 0 && newRemaining === 0
    ? { additions, deletions }
    : undefined;
}
