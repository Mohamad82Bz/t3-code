import { File } from "@pierre/diffs/react";
import type { readToolFile } from "@t3tools/client-runtime/work-log/item-detail";

import { useTheme } from "../../hooks/useTheme";
import { resolveDiffThemeName } from "../../lib/diffRendering";
import { PREFERRED_HIGHLIGHTER } from "../../lib/syntaxHighlighting";
import { DiffWorkerPoolProvider } from "../DiffWorkerPoolProvider";
import { RenderErrorBoundary } from "../RenderErrorBoundary";
import { DIFF_VIEW_UNSAFE_CSS } from "../diffs/StyledDiffCodeView";
import { ToolCodeSurface } from "./ToolCodeSurface";

export function ToolReadFile({
  file,
}: {
  readonly file: NonNullable<ReturnType<typeof readToolFile>>;
}) {
  const { resolvedTheme } = useTheme();
  const raw = (
    <pre className="p-2 font-mono text-xs whitespace-pre">{file.contents || "Empty file."}</pre>
  );
  return (
    <ToolCodeSurface label={`File contents for ${file.fileName}`}>
      <RenderErrorBoundary fallback={raw}>
        {file.contents === "" ? (
          raw
        ) : (
          <DiffWorkerPoolProvider>
            <File
              file={{ name: file.fileName, contents: file.contents }}
              options={{
                overflow: "scroll",
                disableFileHeader: true,
                theme: resolveDiffThemeName(resolvedTheme),
                themeType: resolvedTheme,
                preferredHighlighter: PREFERRED_HIGHLIGHTER,
                unsafeCSS: DIFF_VIEW_UNSAFE_CSS,
                onPostRender: (node) => {
                  // Pierre numbers snippets from one; retain the source positions of partial reads.
                  if (file.startLine === 1) return;
                  for (const gutter of node.shadowRoot?.querySelectorAll("[data-column-number]") ??
                    []) {
                    const number = Number(gutter.getAttribute("data-column-number"));
                    const content = gutter.querySelector("[data-line-number-content]");
                    if (content && Number.isSafeInteger(number))
                      content.textContent = String(number + file.startLine - 1);
                  }
                },
              }}
            />
          </DiffWorkerPoolProvider>
        )}
      </RenderErrorBoundary>
    </ToolCodeSurface>
  );
}
