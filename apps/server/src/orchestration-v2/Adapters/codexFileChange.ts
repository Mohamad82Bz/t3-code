import { fileChangeStats } from "@t3tools/shared/fileChangeStats";

export function codexFileChangeStats(
  changes: ReadonlyArray<{ readonly kind: { readonly type: string }; readonly diff: string }>,
) {
  if (changes.length === 0) return undefined;
  let additions = 0;
  let deletions = 0;
  for (const change of changes) {
    // Codex add/delete payloads contain the whole file, not a unified patch.
    if (change.kind.type === "add" || change.kind.type === "delete") {
      const lines =
        change.diff === ""
          ? 0
          : change.diff.split("\n").length - (change.diff.endsWith("\n") ? 1 : 0);
      if (change.kind.type === "add") additions += lines;
      else deletions += lines;
    } else if (change.kind.type === "update") {
      const stats = fileChangeStats(change.diff);
      if (stats === undefined) return undefined;
      additions += stats.additions;
      deletions += stats.deletions;
    } else {
      return undefined;
    }
  }
  return { additions, deletions };
}
