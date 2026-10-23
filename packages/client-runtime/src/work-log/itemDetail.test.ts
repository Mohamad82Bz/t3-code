import { describe, expect, it } from "vite-plus/test";
import { ThreadId, TurnItemId, type OrchestrationV2TurnItem } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { readToolFile, turnItemOutputImages, turnItemOutputText } from "./itemDetail.ts";

function toolItem(output: unknown): OrchestrationV2TurnItem {
  return {
    id: TurnItemId.make("images"),
    threadId: ThreadId.make("thread"),
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 1,
    status: "completed",
    title: null,
    startedAt: null,
    completedAt: null,
    updatedAt: DateTime.makeUnsafe("2026-10-01T00:00:00Z"),
    type: "dynamic_tool",
    toolName: "screenshots",
    input: {},
    output,
  };
}

describe("tool image output parsing", () => {
  it.each(["array", "content"] as const)(
    "keeps markers for images beyond the served positions in %s output",
    (shape) => {
      // Detail responses retain image metadata after the server strips image bytes.
      const image = { type: "image", mimeType: "image/png" };
      const blocks = Array.from({ length: 8 }, () => ({ ...image }));
      const wrap = (content: unknown[]) => (shape === "array" ? content : { content });
      const withinLimit = toolItem(wrap(blocks));
      expect(turnItemOutputText(withinLimit)).toBeNull();
      expect(turnItemOutputImages(withinLimit)).toHaveLength(8);

      const overflow = toolItem(
        wrap([
          ...blocks,
          { type: "text", text: "Two additional screenshots:" },
          { ...image, sizeBytes: 100 },
          { type: "image", source: { type: "base64", media_type: "image/jpeg" } },
        ]),
      );
      expect(turnItemOutputImages(overflow)).toHaveLength(8);
      expect(turnItemOutputText(overflow)).toBe("Two additional screenshots:\n[image]\n[image]");
    },
  );
});

describe("read tool file contents", () => {
  const read = { ...toolItem({}), toolName: "Read", input: { file_path: "C:\\project\\demo.ts" } };

  it("extracts structured Claude Read output without serializing source code", () => {
    const file = {
      filePath: "C:\\project\\demo.ts",
      content: 'const path = "\\\\tmp";\n\n',
      startLine: 24,
    };
    const item = { ...read, output: { type: "text", file } };
    expect(readToolFile(item)).toEqual({
      fileName: file.filePath,
      contents: file.content,
      startLine: 24,
    });
    expect(turnItemOutputText(item)).toBe(file.content);
    expect(readToolFile({ ...item, output: JSON.stringify(item.output) })).toEqual(
      readToolFile(item),
    );
  });

  it("preserves an empty file and omits unloaded output", () => {
    const item = { ...read, output: { type: "text", file: { filePath: "empty.ts", content: "" } } };
    expect(readToolFile(item)).toEqual({ fileName: "empty.ts", contents: "", startLine: 1 });
    expect(readToolFile({ ...item, outputOmitted: true })).toBeNull();
  });

  it("decodes legacy numbered text while preserving indentation and blank source lines", () => {
    const item = {
      ...read,
      output: [
        {
          type: "text",
          text: "    24→  const value = 1;\n    25→\n    26→  done();\n\n<system-reminder>\nReminder\n</system-reminder>",
        },
      ],
    };
    expect(readToolFile(item)).toEqual({
      fileName: read.input.file_path,
      contents: "  const value = 1;\n\n  done();",
      startLine: 24,
    });
    expect(readToolFile({ ...read, output: "1\tfirst\n2\tsecond\n" })?.contents).toBe(
      "first\nsecond",
    );
  });

  it("does not mistake errors, other tools, or non-text reads for source", () => {
    expect(readToolFile({ ...read, output: "File does not exist." })).toBeNull();
    expect(readToolFile({ ...read, output: "1→first\n3→not consecutive" })).toBeNull();
    expect(
      readToolFile({ ...read, output: { type: "image", file: { filePath: "image.png" } } }),
    ).toBeNull();
    expect(
      readToolFile({
        ...toolItem({}),
        output: { type: "text", file: { filePath: "file.ts", content: "source" } },
      }),
    ).toBeNull();
  });
});
