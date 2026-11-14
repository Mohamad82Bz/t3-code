import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { filterQwenPunctuation, openQwenStream } from "./qwenStream";

class Socket {
  static OPEN = 1;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  emit(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function setup(settings = {}) {
  const socket = new Socket();
  const constructor = Object.assign(
    vi.fn(function () {
      return socket;
    }),
    { OPEN: 1 },
  );
  vi.stubGlobal("WebSocket", constructor);
  const abort = new AbortController();
  const onDelta = vi.fn();
  const onError = vi.fn();
  const starting = openQwenStream({
    config: { endpoint: "ws://127.0.0.1:8765/v1/stream", token: "test-token" },
    settings: { ...DEFAULT_CLIENT_SETTINGS, ...settings },
    signal: abort.signal,
    onDelta,
    onError,
  });
  socket.onopen?.();
  return {
    socket,
    abort,
    onDelta,
    onError,
    starting,
    [Symbol.dispose]() {
      abort.abort();
      vi.unstubAllGlobals();
    },
  };
}

it.each([
  ["Hello, world. Really?!", "Hello world Really"],
  ["سلام، دنیا؛ خوب؟", "سلام دنیا خوب"],
  ["Don't re-type ‘this’…", "Don't re-type this"],
])("filters only the incoming transcript: %s", (text, expected) => {
  expect(filterQwenPunctuation(text, false)).toBe(expected);
  expect(filterQwenPunctuation(text, true)).toBe(text);
});

it("streams PCM16 and filtered deltas exactly once without replaying the full final transcript", async () => {
  using test = setup();
  expect(JSON.parse(test.socket.send.mock.calls[0]![0])).toMatchObject({
    type: "start",
    sample_rate: 16_000,
    commit_mode: "stable",
  });
  test.socket.emit({ type: "started" });
  const stream = await test.starting;
  stream.feed(new Float32Array([-2, 0, 0.5, 2]));
  expect([...new Int16Array(test.socket.send.mock.calls[1]![0])]).toEqual([
    -32767, 0, 16383, 32767,
  ]);
  test.socket.emit({ type: "partial", committed_delta: "Hello, " });
  test.socket.emit({ type: "final", committed_delta: "world. " });
  const finished = stream.finish();
  test.socket.emit({ type: "finished", text: "Hello, world." });
  expect(await finished).toBe("Hello world ");
  expect(test.onDelta.mock.calls).toEqual([["Hello "], ["world "]]);
  expect(test.socket.close).toHaveBeenCalledOnce();
});

it("uses the complete finished text in buffered mode and can preserve punctuation", async () => {
  using test = setup({ dictationLiveMode: false, dictationPunctuation: true });
  test.socket.emit({ type: "started" });
  const stream = await test.starting;
  test.socket.emit({ type: "final", committed_delta: "ignored partial" });
  const finished = stream.finish();
  test.socket.emit({ type: "finished", text: "Hello, world!" });
  expect(await finished).toBe("Hello, world!");
  expect(test.onDelta).not.toHaveBeenCalled();
});

it("reports a disconnect after startup and rejects a pending finish instead of hanging", async () => {
  using test = setup();
  test.socket.emit({ type: "started" });
  const stream = await test.starting;
  const finished = stream.finish();
  test.socket.onclose?.();
  await expect(finished).rejects.toThrow("disconnected");
  expect(test.onError).toHaveBeenCalledWith("Qwen Dictation API disconnected.");
});

it("cancels startup and ignores late recognition events", async () => {
  using test = setup();
  test.abort.abort();
  await expect(test.starting).rejects.toThrow("cancelled");
  test.socket.emit({ type: "final", committed_delta: "late text" });
  expect(test.onDelta).not.toHaveBeenCalled();
  expect(test.onError).not.toHaveBeenCalled();
  expect(test.socket.close).toHaveBeenCalledOnce();
});
