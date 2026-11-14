import type { DesktopDictationSessionConfig, ClientSettings } from "@t3tools/contracts";

export function filterQwenPunctuation(text: string, punctuation: boolean): string {
  if (punctuation) return text;
  return text.replace(/\p{P}/gu, (mark, offset: number) => {
    const inWord =
      /[\p{L}\p{N}]/u.test(text[offset - 1] ?? "") && /[\p{L}\p{N}]/u.test(text[offset + 1] ?? "");
    return inWord && /['’-]/u.test(mark) ? mark : "";
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export async function openQwenStream(input: {
  config: DesktopDictationSessionConfig;
  settings: Pick<
    ClientSettings,
    "dictationLanguage" | "dictationContext" | "dictationLiveMode" | "dictationPunctuation"
  >;
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onError: (message: string) => void;
}) {
  input.signal.throwIfAborted();
  const socket = new WebSocket(input.config.endpoint);
  const started = deferred<void>();
  const finished = deferred<string>();
  let ready = false;
  let settled = false;
  let transcript = "";
  // Finish may arrive after a connection error, before a caller can await it.
  void finished.promise.catch(() => undefined);
  const release = () => {
    input.signal.removeEventListener("abort", abort);
    clearTimeout(startTimeout);
    clearTimeout(finishTimeout);
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
  };
  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    started.reject(error);
    finished.reject(error);
    release();
    if (ready && !input.signal.aborted) input.onError(error.message);
  };
  const abort = () => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "cancel" }));
    fail(new Error("Qwen dictation cancelled."));
  };
  let finishTimeout: ReturnType<typeof setTimeout> | undefined;
  const startTimeout = setTimeout(() => fail(new Error("Qwen Dictation did not respond.")), 15_000);
  input.signal.addEventListener("abort", abort, { once: true });
  socket.onopen = () =>
    socket.send(
      JSON.stringify({
        type: "start",
        token: input.config.token,
        language: input.settings.dictationLanguage,
        context: input.settings.dictationContext,
        sample_rate: 16_000,
        commit_mode: input.settings.dictationLiveMode ? "stable" : "session",
      }),
    );
  socket.onerror = () =>
    fail(new Error("Qwen Dictation API is unavailable. Check that it is running on this PC."));
  socket.onclose = () => fail(new Error("Qwen Dictation API disconnected."));
  socket.onmessage = (event) => {
    if (settled || typeof event.data !== "string") return;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(event.data) as Record<string, unknown>;
    } catch {
      return;
    }
    if (message.type === "started") {
      ready = true;
      clearTimeout(startTimeout);
      started.resolve();
      return;
    }
    if (message.type === "error") {
      fail(
        new Error(
          typeof message.message === "string" ? message.message : "Qwen recognition failed.",
        ),
      );
      return;
    }
    if (!ready) return;
    const delta = filterQwenPunctuation(
      typeof message.committed_delta === "string" ? message.committed_delta : "",
      input.settings.dictationPunctuation,
    );
    if (input.settings.dictationLiveMode && delta) {
      transcript += delta;
      input.onDelta(delta);
    }
    if (message.type === "finished") {
      settled = true;
      const text = input.settings.dictationLiveMode
        ? transcript
        : filterQwenPunctuation(
            typeof message.text === "string" ? message.text : delta,
            input.settings.dictationPunctuation,
          );
      release();
      finished.resolve(text);
    } else if (message.type === "cancelled") {
      fail(new Error("Qwen dictation cancelled."));
    }
  };
  await started.promise;
  return {
    feed: (pcm: Float32Array) => {
      if (settled || input.signal.aborted || socket.readyState !== WebSocket.OPEN) return;
      const bytes = new ArrayBuffer(pcm.length * 2);
      const view = new DataView(bytes);
      for (let index = 0; index < pcm.length; index++)
        view.setInt16(index * 2, Math.max(-1, Math.min(1, pcm[index]!)) * 0x7fff, true);
      socket.send(bytes);
    },
    finish: () => {
      if (!settled && finishTimeout === undefined) {
        socket.send(JSON.stringify({ type: "finish" }));
        finishTimeout = setTimeout(() => fail(new Error("Qwen Dictation did not finish.")), 60_000);
      }
      return finished.promise;
    },
  };
}
