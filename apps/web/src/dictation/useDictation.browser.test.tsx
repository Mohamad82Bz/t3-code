import { useLayoutEffect } from "react";
import { DEFAULT_CLIENT_SETTINGS, EnvironmentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { act, render, stubGlobal } from "../../test/render";
import { useDictation } from "./useDictation";

const mocks = vi.hoisted(() => ({
  delta: (_text: string) => {},
  signal: null as AbortSignal | null,
  finish: vi.fn(async () => "buffered words"),
  stopped: vi.fn(async () => {}),
  released: vi.fn(),
  draft: "",
  selection: 0,
  voice: null as ReturnType<typeof useDictation> | null,
}));
vi.mock("./qwenStream", () => ({
  openQwenStream: async (input: { onDelta: (text: string) => void; signal: AbortSignal }) => {
    mocks.delta = input.onDelta;
    mocks.signal = input.signal;
    return { feed() {}, finish: mocks.finish };
  },
}));
vi.mock("../speech/browserPcmCapture", () => ({
  createBrowserPcmCapture: (_input: unknown, prepare: (options: unknown) => unknown) => ({
    transcriber: { prepare },
    recorder: { prepareToRecordAsync: async () => {}, record() {}, stop: mocks.stopped },
    cancelRecording: mocks.released,
  }),
}));

function setup() {
  mocks.finish.mockReset().mockResolvedValue("buffered words");
  mocks.stopped.mockClear();
  mocks.released.mockClear();
  mocks.draft = "Manual, text.";
  mocks.selection = mocks.draft.length;
  mocks.signal = null;
}
function Probe({ owner = "draft", live = true, enabled = true } = {}) {
  const voice = useDictation(
    {
      environmentId: EnvironmentId.make("test"),
      ownerKey: owner,
      draftText: mocks.draft,
      readDraft: () => ({
        text: mocks.draft,
        selection: { start: mocks.selection, end: mocks.selection },
      }),
      commitDraft: (text, selection) => {
        mocks.draft = text;
        mocks.selection = selection.end;
      },
    },
    { ...DEFAULT_CLIENT_SETTINGS, dictationLiveMode: live },
    enabled,
  );
  useLayoutEffect(() => {
    mocks.voice = voice;
  });
  return null;
}
function bridge() {
  return stubGlobal("desktopBridge", {
    getDictationSessionConfig: async () => ({ endpoint: "ws://localhost", token: "test" }),
  } as unknown as NonNullable<Window["desktopBridge"]>);
}

it("keeps live editing available and Send waits for the final delta without losing manual punctuation", async () => {
  setup();
  using _bridge = bridge();
  await using _screen = await render(<Probe />);
  await act(() => mocks.voice!.start());
  expect(mocks.voice!.state.phase).toBe("recording");
  expect(mocks.voice!.freezesEditor).toBe(false);
  await act(() => mocks.delta("spoken words "));
  mocks.draft += ",";
  mocks.selection = mocks.draft.length;
  const submit = vi.fn();
  let finish!: (text: string) => void;
  mocks.finish.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(() => mocks.voice!.submitAfterDictation(submit));
  expect(submit).not.toHaveBeenCalled();
  await act(() => {
    mocks.delta("more words ");
    finish("spoken words more words");
  });
  await vi.waitFor(() =>
    expect(submit).toHaveBeenCalledWith("Manual, text. spoken words, more words"),
  );
  expect(mocks.voice!.state.phase).toBe("idle");
});

it("drops late callbacks and a queued send when the editor owner or backend changes", async () => {
  setup();
  using _bridge = bridge();
  await using screen = await render(<Probe />);
  await act(() => mocks.voice!.start());
  const lateDelta = mocks.delta;
  await screen.rerender(<Probe owner="another-draft" enabled={false} />);
  await act(() => lateDelta("must not arrive"));
  expect(mocks.draft).toBe("Manual, text.");
  expect(mocks.signal?.aborted).toBe(true);
  expect(mocks.voice!.state.phase).toBe("idle");
});

it("inserts buffered speech once and cancels pending submission without adding text", async () => {
  setup();
  using _bridge = bridge();
  await using _screen = await render(<Probe live={false} />);
  await act(() => mocks.voice!.start());
  expect(mocks.voice!.freezesEditor).toBe(true);
  await act(() => mocks.voice!.stop());
  expect(mocks.draft).toBe("Manual, text. buffered words");
  await act(() => mocks.voice!.start());
  const submit = vi.fn();
  await act(() => {
    mocks.voice!.submitAfterDictation(submit);
    mocks.voice!.cancel();
  });
  expect(submit).not.toHaveBeenCalled();
  expect(mocks.draft).toBe("Manual, text. buffered words");
});
