import {
  resolveTranscriptCommit,
  VOICE_RECORDING_LIMIT_SECONDS,
  voiceInputBlocksSubmission,
  type VoiceInputState,
} from "@t3tools/client-runtime/voice-input";
import type { ClientSettings } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";

import { useStableCallback } from "~/hooks/useStableCallback";
import { createBrowserPcmCapture } from "../speech/browserPcmCapture";
import type { HookInput } from "../speech/useEnvironmentSpeechInput";
import { openQwenStream } from "./qwenStream";

const IDLE: VoiceInputState = { phase: "idle", error: null, errorAction: null };

type Session = {
  ownerKey: string;
  abort: AbortController;
  capture: ReturnType<typeof createBrowserPcmCapture>;
  stream?: Awaited<ReturnType<typeof openQwenStream>>;
  starting: Promise<void>;
  stopping: Promise<void> | null;
  submit: ((text: string) => void) | null;
  live: boolean;
};

export function useDictation(input: HookInput, settings: ClientSettings, enabled: boolean) {
  const [state, setState] = useState<VoiceInputState>(IDLE);
  const [level, setLevel] = useState(0);
  const sessionRef = useRef<Session | null>(null);
  const current = useRef({ input, settings, enabled });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes the committed draft owner and preferences to asynchronous microphone callbacks
  useEffect(() => {
    current.current = { input, settings, enabled };
  });
  const isCurrent = useStableCallback(
    (session: Session) =>
      sessionRef.current === session &&
      !session.abort.signal.aborted &&
      current.current.enabled &&
      !current.current.input.disabled &&
      current.current.input.ownerKey === session.ownerKey,
  );
  const release = useStableCallback((session: Session) => {
    if (sessionRef.current === session) sessionRef.current = null;
    session.abort.abort();
    session.capture.cancelRecording();
  });
  const fail = useStableCallback((session: Session, cause: unknown) => {
    if (!isCurrent(session)) return;
    release(session);
    setLevel(0);
    setState({
      phase: "error",
      error: cause instanceof Error ? cause.message : "Qwen dictation failed.",
      errorAction: "retry",
    });
  });
  const insert = useStableCallback((session: Session, text: string) => {
    if (!isCurrent(session)) return;
    const draft = current.current.input.readDraft();
    const snapshot = { ...draft, ownerKey: session.ownerKey, revision: 0 };
    const result = resolveTranscriptCommit(
      snapshot,
      snapshot,
      text,
      current.current.settings.dictationLanguage === "Persian" ? "fa" : "en",
    );
    if (result.kind === "commit") current.current.input.commitDraft(result.text, result.selection);
  });
  const cancel = useStableCallback(() => {
    const session = sessionRef.current;
    if (session) release(session);
    setLevel(0);
    setState(IDLE);
  });
  const stop = useStableCallback(async () => {
    const session = sessionRef.current;
    if (!session || session.stopping) return session?.stopping ?? undefined;
    session.stopping = (async () => {
      try {
        await session.starting;
        if (!isCurrent(session) || !session.stream) return;
        setState({ phase: "transcribing", error: null, errorAction: null });
        await session.capture.recorder.stop();
        const text = await session.stream.finish();
        if (!isCurrent(session)) return;
        if (!session.live) insert(session, text);
        const submit = session.submit;
        const draft = current.current.input.readDraft().text;
        release(session);
        setLevel(0);
        setState(IDLE);
        submit?.(draft);
      } catch (cause) {
        fail(session, cause);
      }
    })();
    return session.stopping;
  });
  const start = useStableCallback(async () => {
    const { input: draft, settings: preferences, enabled: active } = current.current;
    const bridge = window.desktopBridge;
    if (!active || draft.disabled || !bridge || sessionRef.current) return;
    const abort = new AbortController();
    const session: Session = {
      ownerKey: draft.ownerKey,
      abort,
      live: preferences.dictationLiveMode,
      starting: Promise.resolve(),
      stopping: null,
      submit: null,
      capture: createBrowserPcmCapture(
        {
          getMicrophoneId: () => preferences.voiceMicrophone,
          onLevel: (value) => {
            if (isCurrent(session)) setLevel(value);
          },
          onDurationLimit: () => void stop(),
          onError: (message) => fail(session, new Error(message)),
        },
        async ({ signal }) => {
          const config = await bridge.getDictationSessionConfig();
          signal.throwIfAborted();
          const stream = await openQwenStream({
            config,
            settings: preferences,
            signal,
            onDelta: (text) => insert(session, text),
            onError: (message) => fail(session, new Error(message)),
          });
          session.stream = stream;
          return { locale: "en", transcribe: async () => "", streaming: stream };
        },
      ),
    };
    sessionRef.current = session;
    setLevel(0);
    setState({ phase: "preparing", error: null, errorAction: null });
    session.starting = (async () => {
      try {
        await session.capture.transcriber.prepare({ signal: abort.signal });
        abort.signal.throwIfAborted();
        await session.capture.recorder.prepareToRecordAsync(abort.signal);
        if (!isCurrent(session)) {
          release(session);
          return;
        }
        session.capture.recorder.record({ forDuration: VOICE_RECORDING_LIMIT_SECONDS });
        setState({ phase: "recording", error: null, errorAction: null });
      } catch (cause) {
        fail(session, cause);
      }
    })();
    await session.starting;
  });
  const submitAfterDictation = useStableCallback((submit: (text: string) => void) => {
    if (current.current.input.disabled) return;
    const session = sessionRef.current;
    if (!session) {
      submit(current.current.input.readDraft().text);
      return;
    }
    if (session.submit) return;
    session.submit = submit;
    void stop();
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- abandons microphone capture when the editor owner or selected transcription backend changes
  useEffect(() => {
    const session = sessionRef.current;
    if (!enabled || input.disabled || (session && session.ownerKey !== input.ownerKey)) cancel();
    return cancel;
  }, [input.ownerKey, input.disabled, enabled, cancel]);

  return {
    available:
      enabled &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof AudioWorkletNode !== "undefined",
    state,
    level,
    preview: null,
    preparing: state.phase === "preparing",
    blocksSubmission: voiceInputBlocksSubmission(state),
    freezesEditor:
      voiceInputBlocksSubmission(state) &&
      !(state.phase === "recording" && settings.dictationLiveMode),
    start,
    stop,
    cancel,
    submitAfterDictation,
    skipPostProcessing: () => undefined,
  };
}
