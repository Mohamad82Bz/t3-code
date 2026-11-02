import type { DesktopDictationShortcutEvent, UnifiedSettings } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";

import { useStableCallback } from "~/hooks/useStableCallback";

export type DictationState = "idle" | "starting" | "listening" | "finishing" | "error";

interface DictationSession {
  readonly socket: WebSocket;
  readonly stream: MediaStream;
  readonly audioContext: AudioContext;
  readonly source: MediaStreamAudioSourceNode;
  readonly processor: ScriptProcessorNode;
  readonly liveMode: boolean;
  readonly startedAt: number;
  started: boolean;
  finishRequested: boolean;
  settled: boolean;
}

function downsampleToPcm16(input: Float32Array, sourceRate: number): ArrayBuffer {
  const targetRate = 16_000;
  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Int16Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = sourceIndex - left;
    const sample = (input[left] ?? 0) * (1 - fraction) + (input[right] ?? 0) * fraction;
    output[index] = Math.max(-1, Math.min(1, sample)) * 0x7fff;
  }
  return output.buffer;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Dictation could not start.";
}

export function useDictation({
  settings,
  onText,
}: {
  readonly settings: Pick<
    UnifiedSettings,
    | "dictationEnabled"
    | "dictationActivationMode"
    | "dictationLanguage"
    | "dictationContext"
    | "dictationLiveMode"
  >;
  readonly onText: (text: string) => boolean;
}) {
  const [state, setState] = useState<DictationState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<DictationSession | null>(null);
  const onTextStable = useStableCallback(onText);

  const cleanup = useStableCallback((session: DictationSession) => {
    if (sessionRef.current === session) sessionRef.current = null;
    session.processor.onaudioprocess = null;
    session.processor.disconnect();
    session.source.disconnect();
    session.stream.getTracks().forEach((track) => track.stop());
    void session.audioContext.close().catch(() => undefined);
    if (
      session.socket.readyState === WebSocket.OPEN ||
      session.socket.readyState === WebSocket.CONNECTING
    ) {
      session.socket.close();
    }
  });

  const finish = useStableCallback(() => {
    const session = sessionRef.current;
    if (!session || session.settled) return;
    session.finishRequested = true;
    setState("finishing");
    if (session.started && session.socket.readyState === WebSocket.OPEN) {
      session.socket.send(JSON.stringify({ type: "finish" }));
    }
  });

  const start = useStableCallback(async () => {
    if (!settings.dictationEnabled || sessionRef.current !== null) return;
    const bridge = window.desktopBridge;
    if (!bridge || !navigator.mediaDevices?.getUserMedia) return;

    setError(null);
    setElapsedSeconds(0);
    setState("starting");
    let session: DictationSession | null = null;
    try {
      const config = await bridge.getDictationSessionConfig();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 16_000,
        },
      });
      const audioContext = new AudioContext({ sampleRate: 16_000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      const socket = new WebSocket(config.endpoint);
      socket.binaryType = "arraybuffer";
      session = {
        socket,
        stream,
        audioContext,
        source,
        processor,
        liveMode: settings.dictationLiveMode,
        startedAt: Date.now(),
        started: false,
        finishRequested: false,
        settled: false,
      };
      sessionRef.current = session;

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const rejectStart = (cause: unknown) => {
          if (settled) return;
          settled = true;
          reject(cause);
        };
        socket.onerror = () => rejectStart(new Error("Qwen Dictation API is unavailable."));
        socket.onclose = () => rejectStart(new Error("Qwen Dictation API disconnected."));
        socket.onopen = () => {
          socket.send(
            JSON.stringify({
              type: "start",
              token: config.token,
              language: settings.dictationLanguage,
              context: settings.dictationContext,
              sample_rate: 16_000,
              commit_mode: settings.dictationLiveMode ? "stable" : "session",
            }),
          );
        };
        socket.onmessage = (event) => {
          if (typeof event.data !== "string") return;
          let message: Record<string, unknown>;
          try {
            message = JSON.parse(event.data) as Record<string, unknown>;
          } catch {
            return;
          }
          if (message.type === "started") {
            settled = true;
            session!.started = true;
            setState("listening");
            if (session!.finishRequested) {
              socket.send(JSON.stringify({ type: "finish" }));
            }
            resolve();
            return;
          }
          if (message.type === "error") {
            rejectStart(
              new Error(
                typeof message.message === "string" ? message.message : "Recognition failed.",
              ),
            );
            return;
          }
          const delta = typeof message.committed_delta === "string" ? message.committed_delta : "";
          if (session!.liveMode && delta.length > 0) onTextStable(delta);
          if (message.type === "finished") {
            if (!session!.liveMode && delta.length > 0) onTextStable(delta);
            session!.settled = true;
            cleanup(session!);
            setState("idle");
            setElapsedSeconds(0);
          }
          if (message.type === "cancelled") {
            session!.settled = true;
            cleanup(session!);
            setState("idle");
            setElapsedSeconds(0);
          }
        };
      });

      source.connect(processor);
      processor.connect(audioContext.destination);
      processor.onaudioprocess = (event) => {
        if (!session || session.settled || !session.started || session.finishRequested) return;
        if (socket.readyState !== WebSocket.OPEN) return;
        const input = event.inputBuffer.getChannelData(0);
        socket.send(downsampleToPcm16(input, audioContext.sampleRate));
      };
      await audioContext.resume();
    } catch (cause) {
      if (session) {
        session.settled = true;
        cleanup(session);
      }
      setState("error");
      setError(formatError(cause));
    }
  });

  const toggle = useStableCallback(() => {
    if (sessionRef.current) finish();
    else void start();
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the global desktop shortcut listener synchronized with the mounted composer
  useEffect(() => {
    const bridge = window.desktopBridge;
    if (!bridge || !settings.dictationEnabled) return;
    const unsubscribe = bridge.onDictationShortcut((event: DesktopDictationShortcutEvent) => {
      if (event.type === "toggle") {
        toggle();
      } else if (settings.dictationActivationMode === "hold") {
        if (event.type === "down") void start();
        else if (event.type === "up") finish();
      }
    });
    return unsubscribe;
  }, [finish, settings.dictationActivationMode, settings.dictationEnabled, start, toggle]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the elapsed recording indicator synchronized with the active native recording session
  useEffect(() => {
    if (state === "idle" || state === "error") return;
    const timer = window.setInterval(() => {
      const session = sessionRef.current;
      if (session)
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000)));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [state]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- releases the microphone, audio graph and WebSocket resource when the composer unmounts
  useEffect(() => {
    return () => {
      const session = sessionRef.current;
      if (!session) return;
      session.settled = true;
      if (session.socket.readyState === WebSocket.OPEN) {
        session.socket.send(JSON.stringify({ type: "cancel" }));
      }
      cleanup(session);
    };
  }, [cleanup]);

  return {
    state,
    elapsedSeconds,
    error,
    isActive: state === "starting" || state === "listening" || state === "finishing",
    toggle,
    start,
    finish,
  };
}
