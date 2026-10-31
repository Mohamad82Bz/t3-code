import {
  CheckpointId,
  CheckpointRef,
  CheckpointScopeId,
  MessageId,
  ContextHandoffId,
  ProviderThreadId,
  NodeId,
  EventId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2ThreadStreamItem,
  OrchestrationV2TurnItem,
  OrchestrationV2TurnItemJson,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import { coalesceLiveUpdatedEvents } from "./ThreadLiveEventCoalescer.ts";
import {
  boundFileChangeForStorage,
  makeLiveBodyDeduper,
  projectTurnItemForWire,
  projectTurnItemForDetail,
  projectDomainEventForWire,
} from "./WireProjection.ts";
import { threadShellFromProjection } from "./ProjectionStore.ts";
import { MAX_TOOL_OUTPUT_IMAGES, toolOutputImages } from "@t3tools/shared/toolOutput";

const decodeTurnItem = Schema.decodeUnknownSync(OrchestrationV2TurnItem);
const encodeTurnItemJson = Schema.encodeSync(OrchestrationV2TurnItemJson);
const decodeTurnItemJson = Schema.decodeUnknownSync(OrchestrationV2TurnItemJson);

const base = {
  id: TurnItemId.make("tool-1"),
  type: "dynamic_tool" as const,
  threadId: ThreadId.make("thread-1"),
  runId: null,
  nodeId: null,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: 1,
  status: "completed" as const,
  title: "MCP tool",
  toolName: "mcp__github__fetch_pr",
  input: { pr: 42 },
  startedAt: DateTime.makeUnsafe("2026-08-13T00:00:00.000Z"),
  completedAt: DateTime.makeUnsafe("2026-08-13T00:00:01.000Z"),
  updatedAt: DateTime.makeUnsafe("2026-08-13T00:00:01.000Z"),
};

describe("orchestration V2 wire projection", () => {
  it("keeps copied handoff transcripts out of activity items and live events", () => {
    const item = {
      ...base,
      type: "handoff" as const,
      contextHandoffId: ContextHandoffId.make("handoff:wire"),
      fromProviderThreadIds: [],
      toProviderThreadId: ProviderThreadId.make("target"),
      fromProviderInstanceIds: [],
      toProviderInstanceId: ProviderInstanceId.make("codex"),
      strategy: "full_thread_summary" as const,
      summary: "PRIVATE_HANDOFF_TRANSCRIPT",
    };
    const projected = projectTurnItemForWire(item);
    expect(projected).not.toHaveProperty("summary");
    expect(decodeTurnItem(projected)).toMatchObject({ contextHandoffId: item.contextHandoffId });
    const event = {
      id: EventId.make("handoff:wire"),
      type: "turn-item.updated" as const,
      threadId: base.threadId,
      occurredAt: base.updatedAt,
      payload: item,
    };
    expect(JSON.stringify(projectDomainEventForWire(event))).not.toContain(item.summary);
    expect(item.summary).toBe("PRIVATE_HANDOFF_TRANSCRIPT");
  });

  it("preserves image metadata through wire and JSON contracts while redacting output", () => {
    const item = {
      ...base,
      toolName: "Read",
      input: { file_path: "/workspace/reference.png" },
      viewedImagePath: "/workspace/reference.png",
      output: { data: "private-image-data" },
    } satisfies OrchestrationV2TurnItem;
    const projected = projectTurnItemForWire(item);
    const live = decodeTurnItem(projected);
    const encoded = encodeTurnItemJson(live);
    const json = decodeTurnItemJson(encoded);
    const decoded = decodeTurnItem(json);
    expect(decoded).toMatchObject({ viewedImagePath: "/workspace/reference.png" });
    expect(decoded).not.toHaveProperty("output");
    expect(item.output.data).toBe("private-image-data");
  });

  it("keeps transcript bodies out of shell rows", () => {
    const now = DateTime.makeUnsafe("2026-08-13T00:00:00.000Z");
    const threadId = ThreadId.make("thread-shell-budget");
    const projection = {
      thread: {
        createdBy: "user",
        creationSource: "web",
        id: threadId,
        projectId: ProjectId.make("project-shell-budget"),
        title: "Shell payload budget",
        providerInstanceId: ProviderInstanceId.make("codex"),
        modelSelection: null,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        lineage: {
          parentThreadId: null,
          relationshipToParent: null,
          rootThreadId: threadId,
        },
        forkedFrom: null,
        activeProviderThreadId: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        deletedAt: null,
      },
      runs: [],
      attempts: [],
      runtimeRequests: [],
      messages: [
        {
          id: MessageId.make("message-shell-budget"),
          role: "assistant",
          text: "x".repeat(1_000_000),
          updatedAt: now,
        },
      ],
      providerSessions: [],
      providerThreads: [],
      turnItems: [],
      visibleTurnItems: [],
      plans: [],
      updatedAt: now,
    } as unknown as OrchestrationV2ThreadProjection;

    const shell = threadShellFromProjection(projection);

    expect(shell.latestVisibleMessage).toBeNull();
    expect(JSON.stringify(shell).length).toBeLessThan(2_000);
  });

  it("omits even small dynamic tool results while retaining input", () => {
    const item = { ...base, output: { ok: true } } satisfies OrchestrationV2TurnItem;
    expect(projectTurnItemForWire(item)).toEqual({ ...base, outputOmitted: true });
    expect(item.output).toEqual({ ok: true });
  });

  it("uses encoded JSON bytes for strings near the dynamic-value limit", () => {
    const small = '"'.repeat(8_191);
    const large = '"'.repeat(8_192);
    const smallItem = { ...base, input: small };
    expect(projectTurnItemForWire(smallItem)).toEqual(smallItem);
    const projected = projectTurnItemForWire({ ...base, input: large });
    expect(projected.type === "dynamic_tool" ? projected.input : null).toEqual({
      summary: '"'.repeat(159) + "…",
      truncated: true,
    });
  });

  it("truncates detail at a UTF-8 boundary without changing the source", () => {
    const progress = "a".repeat(32_767) + "😀" + "x".repeat(100_000);
    const item = {
      ...base,
      type: "subagent" as const,
      subagentId: NodeId.make("child-agent"),
      origin: "app_owned" as const,
      driver: ProviderDriverKind.make("codex"),
      providerInstanceId: ProviderInstanceId.make("codex"),
      childThreadId: null,
      prompt: "Inspect code",
      result: null,
      progress,
    };
    const projected = projectTurnItemForWire(item);
    expect(projected.type === "subagent" ? projected.progress : null).toBe(
      "a".repeat(32_767) + "\n… output truncated for transport",
    );
    expect(item.progress).toBe(progress);
  });

  it("leaves a screenshot's bytes out of the fetched tool output", () => {
    const data = "A".repeat(600_000);
    const item = {
      ...base,
      type: "dynamic_tool" as const,
      toolName: "mcp__t3-code__device_screenshot",
      input: { deviceId: "phone" },
      output: {
        content: [{ type: "image", source: { type: "base64", media_type: "image/png", data } }],
      },
    };
    expect(projectTurnItemForDetail(item)).toMatchObject({
      output: { content: [{ type: "image", mimeType: "image/png" }] },
    });
    expect(item.output.content[0]?.source.data).toBe(data);
  });

  it("keeps image markers when the rest of a tool output is too large to send", () => {
    const image = {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "AAAA" },
    };
    const item = {
      ...base,
      type: "dynamic_tool" as const,
      output: { content: [{ type: "text", text: "x".repeat(300_000) }, image] },
    };
    const projected = projectTurnItemForDetail(item);
    const output = projected.type === "dynamic_tool" ? projected.output : null;
    expect(Array.isArray(output) ? output.slice(1) : null).toEqual([
      { type: "image", mimeType: "image/png" },
    ]);
    expect(JSON.stringify(output).length).toBeLessThan(270_000);
  });

  it("bounds a tool output made of many images", () => {
    const image = { type: "image", data: "AAAA", mimeType: "image/png" };
    const item = {
      ...base,
      type: "dynamic_tool" as const,
      output: Array.from({ length: 10_000 }, () => image),
    };
    const projected = projectTurnItemForDetail(item);
    const output = projected.type === "dynamic_tool" ? projected.output : null;
    expect(Array.isArray(output) ? output.length : null).toBe(1 + MAX_TOOL_OUTPUT_IMAGES);
    expect(Array.isArray(output) ? String(output[0]?.text).length : null).toBeLessThan(263_000);
    expect(toolOutputImages(output)).toHaveLength(MAX_TOOL_OUTPUT_IMAGES);
  });

  it("keeps failure evidence without retaining command output", () => {
    const item = {
      ...base,
      type: "command_execution" as const,
      input: "cat missing-file",
      output: "cat: missing-file: No such file or directory",
    };
    const projected = projectTurnItemForWire(item);
    expect(projected).not.toHaveProperty("output");
    expect(projected).toMatchObject({ outputIndicatesFailure: true });
    expect(projectTurnItemForWire(projected)).toEqual(projected);
    expect(projectTurnItemForWire({ ...item, output: "", exitCode: 2 })).toMatchObject({
      outputIndicatesFailure: true,
      exitCode: 2,
    });
  });

  it.each([
    "logs/app.log:12: Error: ENOENT: no such file or directory",
    "fixtures/ci.txt:3: Process exited with exit code 2",
  ])("trusts a zero exit code over failure text in the output: %s", (output) => {
    const projected = projectTurnItemForWire({
      ...base,
      type: "command_execution" as const,
      input: "rg -n error logs fixtures",
      output,
      exitCode: 0,
    });
    expect(projected).not.toHaveProperty("outputIndicatesFailure");
    expect(projected).toMatchObject({ exitCode: 0, outputOmitted: true });
  });

  it("omits inline file bodies but preserves file identity and change counts", () => {
    const item = {
      ...base,
      type: "file_change" as const,
      fileName: "src/main.ts",
      additions: 3,
      deletions: 1,
      diffStr: "+new code",
      oldStr: "old code",
      newStr: "new code",
    };
    const projected = projectTurnItemForWire(item);
    expect(projected).not.toHaveProperty("diffStr");
    expect(projected).not.toHaveProperty("oldStr");
    expect(projected).not.toHaveProperty("newStr");
    expect(projected).toMatchObject({ fileName: "src/main.ts", additions: 3, deletions: 1 });
    expect(item.diffStr).toBe("+new code");
    expect(projectTurnItemForDetail(item)).toMatchObject({ diffStr: "+new code" });
    expect(projectTurnItemForDetail(item)).not.toHaveProperty("oldStr");
    expect(projectTurnItemForDetail(item)).not.toHaveProperty("newStr");
    const { diffStr: _diff, ...contentOnly } = item;
    expect(projectTurnItemForDetail(contentOnly)).toMatchObject({
      oldStr: "old code",
      newStr: "new code",
    });
    expect(projectTurnItemForWire(contentOnly)).not.toHaveProperty("newStr");
    const failed = projectTurnItemForWire({
      ...item,
      status: "failed",
      diffStr: "String to replace not found",
    });
    expect(failed).toMatchObject({ diffStr: "String to replace not found" });
    expect(failed).not.toHaveProperty("newStr");
  });

  it.each(["wire", "detail"] as const)(
    "recovers legacy file change counts in the %s projection without changing stored items",
    (projection) => {
      const project = projection === "wire" ? projectTurnItemForWire : projectTurnItemForDetail;
      const item = {
        ...base,
        type: "file_change" as const,
        fileName: "demo.txt",
        diffStr: "--- demo.txt\n+++ demo.txt\n@@ -1 +1,2 @@\n-old\n+new\n+extra\n",
      };
      const projected = project(item);
      expect(projected).toMatchObject({ additions: 2, deletions: 1 });
      if (projection === "wire") expect(projected).not.toHaveProperty("diffStr");
      else expect(projected).toMatchObject({ diffStr: item.diffStr });
      expect(item).not.toHaveProperty("additions");
      expect(project(projected)).toEqual(projected);
      expect(project({ ...item, diffStr: "@@ -1 +1,2 @@\n-old\n+new" })).not.toHaveProperty(
        "additions",
      );
      expect(project({ ...item, status: "failed" })).not.toHaveProperty("additions");
      expect(project({ ...item, status: "running" })).not.toHaveProperty("additions");
      expect(project({ ...item, additions: 10, deletions: 5 })).toMatchObject({
        additions: 10,
        deletions: 5,
      });
    },
  );

  it.each(["wire", "detail"] as const)(
    "does not recover partial legacy Codex counts in the %s projection",
    (projection) => {
      const project = projection === "wire" ? projectTurnItemForWire : projectTurnItemForDetail;
      const item = {
        ...base,
        type: "file_change" as const,
        fileName: "demo.txt",
        nativeItemRef: {
          driver: ProviderDriverKind.make("codex"),
          nativeId: "legacy-edit",
          strength: "strong" as const,
        },
        diffStr: "@@ -1 +1,2 @@\n-old\n+new\n+extra\n",
      };
      const update = { operation: "update" as const, path: "demo.txt" };
      expect(project(item)).not.toHaveProperty("additions");
      expect(project({ ...item, changes: [] })).not.toHaveProperty("additions");
      expect(
        project({ ...item, changes: [update, { ...update, path: "other.txt" }] }),
      ).not.toHaveProperty("additions");
      expect(project({ ...item, changes: [update] })).toMatchObject({ additions: 2, deletions: 1 });
      expect(project({ ...item, additions: 20, deletions: 10 })).toMatchObject({
        additions: 20,
        deletions: 10,
      });
    },
  );

  it.each([
    { projection: "wire", operation: "add", additions: 2, deletions: 0 },
    { projection: "detail", operation: "add", additions: 2, deletions: 0 },
    { projection: "wire", operation: "delete", additions: 0, deletions: 2 },
    { projection: "detail", operation: "delete", additions: 0, deletions: 2 },
  ] as const)(
    "recovers whole-file Codex $operation counts in the $projection projection",
    ({ projection, operation, additions, deletions }) => {
      const project = projection === "wire" ? projectTurnItemForWire : projectTurnItemForDetail;
      const item = {
        ...base,
        type: "file_change" as const,
        fileName: "demo.txt",
        nativeItemRef: {
          driver: ProviderDriverKind.make("codex"),
          nativeId: "create-file",
          strength: "strong" as const,
        },
        changes: [{ operation, path: "demo.txt" }],
        diffStr: "one\ntwo\n",
      };
      const projected = project(item);
      expect(projected).toMatchObject({ additions, deletions });
      if (projection === "wire") expect(projected).not.toHaveProperty("diffStr");
      else expect(projected).toMatchObject({ diffStr: item.diffStr });
      expect(project(projected)).toEqual(projected);
      expect(item).not.toHaveProperty("additions");
      expect(project({ ...item, nativeItemRef: null })).not.toHaveProperty("additions");
      expect(project({ ...item, status: "failed" })).not.toHaveProperty("additions");
      expect(
        project({
          ...item,
          changes: [...item.changes, { operation, path: "other.txt" }],
        }),
      ).not.toHaveProperty("additions");
    },
  );

  it("keeps Claude's small edit patch when the original file exceeds the storage budget", () => {
    const item = {
      ...base,
      type: "file_change" as const,
      fileName: "large.ts",
      nativeItemRef: {
        driver: ProviderDriverKind.make("claudeAgent"),
        nativeId: "large-edit",
        strength: "strong" as const,
      },
      diffStr: JSON.stringify({
        filePath: "large.ts",
        oldString: "old",
        newString: "new",
        originalFile: "context\n".repeat(10_000),
        structuredPatch: [
          { oldStart: 1640, oldLines: 1, newStart: 1640, newLines: 1, lines: ["-old", "+new"] },
        ],
      }),
    };
    const stored = boundFileChangeForStorage(item);
    expect(stored).toMatchObject({ diffStr: "@@ -1640,1 +1640,1 @@\n-old\n+new\n" });
    expect(boundFileChangeForStorage(stored)).toBe(stored);
    expect(projectTurnItemForDetail(item)).toMatchObject({
      additions: 1,
      deletions: 1,
      diffStr: "@@ -1640,1 +1640,1 @@\n-old\n+new\n",
    });
    expect(projectTurnItemForWire(item)).toMatchObject({ additions: 1, deletions: 1 });
    expect(item.diffStr.length).toBeGreaterThan(32_768);
    expect(boundFileChangeForStorage({ ...item, status: "failed" })).toMatchObject({
      status: "failed",
    });
  });

  it("recovers detail counts before bounding the legacy patch", () => {
    const item = {
      ...base,
      type: "file_change" as const,
      fileName: "large.txt",
      diffStr: `@@ -0,0 +1,1000 @@\n${`+${"x".repeat(400)}\n`.repeat(1000)}`,
    };
    const detail = projectTurnItemForDetail(item);
    expect(detail).toMatchObject({ additions: 1000, deletions: 0 });
    expect(detail.type === "file_change" && detail.diffStr).toContain(
      "output truncated for transport",
    );
    expect(item).not.toHaveProperty("additions");
  });

  it("retains only result identities and failure metadata in live tool events", () => {
    const output = {
      isError: true,
      structuredContent: { threadId: "child-thread", messageId: "message", text: "PRIVATE_BODY" },
      content: [{ type: "text", text: "PRIVATE_BODY" }],
    };
    const event = {
      id: EventId.make("result-event"),
      type: "turn-item.updated" as const,
      threadId: base.threadId,
      occurredAt: base.updatedAt,
      payload: { ...base, output },
    };
    const projected = projectDomainEventForWire(event);
    expect(projected.payload).toMatchObject({
      output: { isError: true, threadId: "child-thread", messageId: "message" },
    });
    expect(JSON.stringify(projected)).not.toContain("PRIVATE_BODY");
    expect(event.payload.output).toBe(output);
    expect(projectDomainEventForWire(projected)).toEqual(projected);
  });
});

describe("live body deduper", () => {
  const at = base.updatedAt;
  const messageId = MessageId.make("message-live");
  const event = (
    sequence: number,
    rest: Pick<OrchestrationV2DomainEvent, "type" | "payload">,
  ): Extract<OrchestrationV2ThreadStreamItem, { kind: "event" }> => ({
    kind: "event",
    sequence,
    event: {
      id: EventId.make(`event-${sequence}`),
      threadId: base.threadId,
      occurredAt: at,
      ...rest,
    } as OrchestrationV2DomainEvent,
  });
  const message = (sequence: number, text: string) =>
    event(sequence, {
      type: "message.updated",
      payload: {
        id: messageId,
        threadId: base.threadId,
        runId: null,
        nodeId: null,
        role: "assistant",
        text,
        attachments: [],
        streaming: true,
        createdBy: "agent",
        creationSource: "provider",
        createdAt: at,
        updatedAt: at,
      },
    });
  const reply = (sequence: number, text: string) =>
    event(sequence, {
      type: "turn-item.updated",
      payload: {
        ...base,
        status: "running",
        type: "assistant_message",
        messageId,
        text,
        streaming: true,
      },
    });
  const payloadOf = (item: OrchestrationV2ThreadStreamItem) =>
    item.kind === "event" ? item.event.payload : undefined;

  it("blanks a reply that repeats the message delivered before it, after coalescing", () => {
    const delivered = coalesceLiveUpdatedEvents([
      message(1, "a"),
      reply(2, "a"),
      message(3, "ab"),
      reply(4, "ab"),
    ]).map(makeLiveBodyDeduper());

    expect(
      delivered.map((item) => [item.kind === "event" && item.sequence, payloadOf(item)]),
    ).toEqual([
      [3, message(3, "ab").event.payload],
      [4, { ...reply(4, "ab").event.payload, text: "", textOmitted: true }],
    ]);
  });

  it("caps a large checkpoint's files for the wire and still dedupes its item", () => {
    const files = Array.from({ length: 250 }, (_, index) => ({
      path: `vendor/file-${index}.ts`,
      kind: "modified",
      additions: 2,
      deletions: 1,
    }));
    const checkpointId = CheckpointId.make("checkpoint-large");
    const scopeId = CheckpointScopeId.make("scope-large");
    const captured = event(1, {
      type: "checkpoint.captured",
      payload: {
        id: checkpointId,
        threadId: base.threadId,
        scopeId,
        runId: null,
        nodeId: NodeId.make("node-large"),
        parentCheckpointId: null,
        ordinalWithinScope: 1,
        appRunOrdinal: null,
        ref: CheckpointRef.make("refs/t3/checkpoints/large"),
        status: "ready",
        files,
        capturedAt: at,
      },
    });
    const item = event(2, {
      type: "turn-item.updated",
      payload: { ...base, type: "checkpoint", checkpointId, scopeId, files },
    });
    const dedupe = makeLiveBodyDeduper();
    const [record, card] = [captured, item].map((streamed) =>
      dedupe({ ...streamed, event: projectDomainEventForWire(streamed.event) }),
    );

    const filesTotal = { count: 250, additions: 500, deletions: 250 };
    expect(payloadOf(record!)).toMatchObject({ files: files.slice(0, 200), filesTotal });
    expect(payloadOf(card!)).toMatchObject({ files: [], filesOmitted: true, filesTotal });
  });

  it("ships a reply whole when its message arrives after it", () => {
    const first = reply(1, "a");
    expect([first, message(2, "a")].map(makeLiveBodyDeduper())[0]).toBe(first);
  });
});
