import { FileDiff } from "@pierre/diffs/react";
import type { OrchestrationV2TurnItem } from "@t3tools/contracts";

import { useTheme } from "../../hooks/useTheme";
import { buildFileDiffIdentityKey, resolveDiffThemeName } from "../../lib/diffRendering";
import { PREFERRED_HIGHLIGHTER } from "../../lib/syntaxHighlighting";
import { DiffWorkerPoolProvider } from "../DiffWorkerPoolProvider";
import { RenderErrorBoundary } from "../RenderErrorBoundary";
import { DIFF_VIEW_UNSAFE_CSS } from "../diffs/StyledDiffCodeView";
import { toolCallDiff } from "./toolCallDiffData";
import { ToolCodeSurface } from "./ToolCodeSurface";

export function ToolCallDiff({
  item,
}: {
  readonly item: Extract<OrchestrationV2TurnItem, { type: "file_change" }>;
}) {
  const { resolvedTheme } = useTheme();
  const patch = toolCallDiff(item);
  if (!patch) return <p className="text-muted-foreground">No diff available for this tool call.</p>;
  const raw = (
    <pre className="p-2 font-mono text-xs whitespace-pre">
      {patch.kind === "raw" ? patch.text : (item.diffStr ?? item.newStr ?? item.oldStr)}
    </pre>
  );
  return (
    <ToolCodeSurface label={`Diff for ${item.fileName}`}>
      <RenderErrorBoundary fallback={raw}>
        {patch.kind === "raw" ? (
          raw
        ) : (
          <DiffWorkerPoolProvider>
            {patch.files.map((file) => (
              <FileDiff
                key={buildFileDiffIdentityKey(file)}
                fileDiff={file}
                options={{
                  diffStyle: "unified",
                  overflow: "scroll",
                  disableFileHeader: true,
                  theme: resolveDiffThemeName(resolvedTheme),
                  themeType: resolvedTheme,
                  preferredHighlighter: PREFERRED_HIGHLIGHTER,
                  unsafeCSS: DIFF_VIEW_UNSAFE_CSS,
                }}
              />
            ))}
          </DiffWorkerPoolProvider>
        )}
      </RenderErrorBoundary>
    </ToolCodeSurface>
  );
}
