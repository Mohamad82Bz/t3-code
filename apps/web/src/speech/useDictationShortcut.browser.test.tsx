import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { expect, it, vi } from "vite-plus/test";
import type { DesktopDictationShortcutEvent } from "@t3tools/contracts";
import { act, render, stubGlobal } from "../../test/render";
import { useDictationShortcut } from "./useDictationShortcut";

vi.mock("../hooks/useSettings", () => ({
  useClientSettings: () => ({ voiceShortcutMode: "hold", dictationActivationMode: "hold" }),
}));

function Probe({ speech }: { speech: Parameters<typeof useDictationShortcut>[0]["speech"] }) {
  useDictationShortcut({
    keybindings: DEFAULT_RESOLVED_KEYBINDINGS,
    speech,
    disabled: false,
    terminalOpen: false,
    modelPickerOpen: false,
  });
  return null;
}

const press = (repeat = false) =>
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "D",
      code: "KeyD",
      ctrlKey: !/Mac/i.test(navigator.platform),
      metaKey: /Mac/i.test(navigator.platform),
      shiftKey: true,
      cancelable: true,
      repeat,
    }),
  );

function actions(available: boolean) {
  return {
    available,
    state: { phase: "idle" as const, error: null, errorAction: null },
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    cancel: vi.fn(),
  };
}

it("routes the global hold shortcut to only one editor and waits for startup before stopping", async () => {
  const listeners = new Set<(event: DesktopDictationShortcutEvent) => void>();
  using _bridge = stubGlobal("desktopBridge", {
    onDictationShortcut: (listener: (event: DesktopDictationShortcutEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  const first = actions(true);
  const second = actions(true);
  let finishStart!: () => void;
  const startup = new Promise<void>((resolve) => {
    finishStart = resolve;
  });
  first.start.mockReturnValue(startup);
  await using _screen = await render(
    <>
      <Probe speech={first} />
      <Probe speech={second} />
    </>,
  );
  await act(() => {
    for (const listener of listeners) listener({ type: "down" });
  });
  expect(first.start).toHaveBeenCalledOnce();
  expect(second.start).not.toHaveBeenCalled();
  await act(() => {
    for (const listener of listeners) listener({ type: "up" });
  });
  expect(first.stop).not.toHaveBeenCalled();
  await act(async () => {
    finishStart();
    await startup;
  });
  expect(first.stop).toHaveBeenCalledOnce();
  expect(second.stop).not.toHaveBeenCalled();
});

it("leaves the browser shortcut alone when dictation is off", async () => {
  const speech = actions(false);
  await using _screen = await render(<Probe speech={speech} />);
  expect(press()).toBe(true);
  expect(speech.start).not.toHaveBeenCalled();
});

it("stops on a new press when the OS omitted keyup, but ignores autorepeat", async () => {
  const speech = actions(true);
  await using screen = await render(<Probe speech={speech} />);
  expect(press()).toBe(false);
  expect(speech.start).toHaveBeenCalledOnce();
  await screen.rerender(
    <Probe speech={{ ...speech, state: { ...speech.state, phase: "recording" } }} />,
  );
  press(true);
  expect(speech.stop).not.toHaveBeenCalled();
  press();
  expect(speech.stop).toHaveBeenCalledOnce();
});

it("finishes a released hold after startup even if the chord was pressed again while preparing", async () => {
  const speech = actions(true);
  let finishStart!: () => void;
  const startup = new Promise<void>((resolve) => {
    finishStart = resolve;
  });
  speech.start.mockReturnValue(startup);
  await using screen = await render(<Probe speech={speech} />);
  press();
  await screen.rerender(
    <Probe speech={{ ...speech, state: { ...speech.state, phase: "preparing" } }} />,
  );
  window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD" }));
  press();
  window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD" }));
  finishStart();
  await startup;
  expect(speech.start).toHaveBeenCalledOnce();
  expect(speech.stop).toHaveBeenCalledOnce();
});
