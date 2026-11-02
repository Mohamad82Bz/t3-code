// @effect-diagnostics nodeBuiltinImport:off -- Dictation reads a local user-owned token file.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import {
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
  type DesktopDictationSessionConfig,
  type DesktopDictationShortcutEvent,
} from "@t3tools/contracts";
import { parseKeybindingShortcut } from "@t3tools/shared/keybindings";
import * as Electron from "electron";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Scope from "effect/Scope";
import * as Schema from "effect/Schema";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import { startGlobalDictationShortcutProcess } from "./GlobalDictationShortcutProcess.ts";

const DEFAULT_ENDPOINT = "ws://127.0.0.1:8765/v1/stream";

export class DesktopDictationSessionConfigError extends Schema.TaggedError<DesktopDictationSessionConfigError>()(
  "DesktopDictationSessionConfigError",
  { path: Schema.String, cause: Schema.Defect() },
) {
  override get message(): string {
    return `Could not read the Qwen Dictation token at ${this.path}.`;
  }
}

function electronAccelerator(shortcut: ReturnType<typeof parseKeybindingShortcut>): string | null {
  if (!shortcut) return null;
  const modifiers: string[] = [];
  if (shortcut.modKey) modifiers.push("CommandOrControl");
  if (shortcut.ctrlKey) modifiers.push("Control");
  if (shortcut.metaKey) modifiers.push("Super");
  if (shortcut.altKey) modifiers.push("Alt");
  if (shortcut.shiftKey) modifiers.push("Shift");
  const key =
    shortcut.key === " "
      ? "Space"
      : shortcut.key === "escape"
        ? "Esc"
        : shortcut.key === "arrowup"
          ? "Up"
          : shortcut.key === "arrowdown"
            ? "Down"
            : shortcut.key === "arrowleft"
              ? "Left"
              : shortcut.key === "arrowright"
                ? "Right"
                : shortcut.key.length > 1
                  ? shortcut.key[0]!.toUpperCase() + shortcut.key.slice(1)
                  : shortcut.key.toUpperCase();
  return [...modifiers, key].join("+");
}

export class DesktopDictation extends Context.Service<
  DesktopDictation,
  {
    readonly start: Effect.Effect<void, never, Scope.Scope>;
    readonly configure: (settings: ClientSettings) => Effect.Effect<void>;
    readonly sessionConfig: (
      settings: ClientSettings,
    ) => Effect.Effect<DesktopDictationSessionConfig, DesktopDictationSessionConfigError>;
  }
>()("@t3tools/desktop/dictation/DesktopDictation") {}

const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  let stopShortcut: (() => void) | undefined;
  let registeredAccelerator: string | undefined;
  let started = false;
  let shortcutGeneration = 0;
  const context = yield* Effect.context<DesktopWindow.DesktopWindow>();
  const runPromise = Effect.runPromiseWith(context);
  const workerPath = NodePath.join(__dirname, "GlobalDictationShortcutWorker.cjs");

  const dispatch = (event: DesktopDictationShortcutEvent) => {
    const dispatchEffect = desktopWindow.dispatchDictationShortcut?.(event);
    if (dispatchEffect) void runPromise(dispatchEffect.pipe(Effect.ignoreCause));
  };
  const release = () => {
    shortcutGeneration += 1;
    stopShortcut?.();
    stopShortcut = undefined;
    if (registeredAccelerator !== undefined) {
      Electron.globalShortcut.unregister(registeredAccelerator);
      registeredAccelerator = undefined;
    }
  };
  const register = (settings: ClientSettings) => {
    release();
    if (environment.platform !== "win32" || !settings.dictationEnabled) return;
    const shortcut = parseKeybindingShortcut(settings.dictationShortcut);
    if (!shortcut) return;
    if (settings.dictationActivationMode === "hold") {
      const generation = shortcutGeneration;
      void startGlobalDictationShortcutProcess(
        workerPath,
        shortcut,
        () => dispatch({ type: "down" }),
        () => dispatch({ type: "up" }),
      )
        .then((stop) => {
          if (!started || generation !== shortcutGeneration) {
            stop();
            return;
          }
          stopShortcut = stop;
        })
        .catch(() => undefined);
      return;
    }
    const accelerator = electronAccelerator(shortcut);
    if (
      !accelerator ||
      !Electron.globalShortcut.register(accelerator, () => dispatch({ type: "toggle" }))
    ) {
      return;
    }
    registeredAccelerator = accelerator;
  };

  return DesktopDictation.of({
    start: Effect.gen(function* () {
      if (started) return;
      started = true;
      const settings = Option.getOrElse(
        yield* clientSettings.get.pipe(Effect.orElseSucceed(() => Option.none())),
        () => DEFAULT_CLIENT_SETTINGS,
      );
      yield* Effect.sync(() => register(settings));
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          started = false;
          release();
        }),
      );
    }).pipe(Effect.withSpan("desktop.dictation.start")),
    configure: Effect.fn("desktop.dictation.configure")(function* (settings): Effect.fn.Return<
      void,
      never
    > {
      if (!started) return;
      yield* Effect.sync(() => register(settings));
    }),
    sessionConfig: Effect.fn("desktop.dictation.sessionConfig")(
      function* (
        settings,
      ): Effect.fn.Return<DesktopDictationSessionConfig, DesktopDictationSessionConfigError> {
        const tokenPath = NodePath.join(settings.dictationPath, "api-token.txt");
        const token = yield* Effect.try({
          try: () => {
            const value = NodeFS.readFileSync(tokenPath, "utf8").trim();
            if (value.length === 0) throw new Error("Qwen Dictation API token is empty.");
            return value;
          },
          catch: (cause) => new DesktopDictationSessionConfigError({ path: tokenPath, cause }),
        });
        return { endpoint: DEFAULT_ENDPOINT, token };
      },
    ),
  });
});

export const layer = Layer.effect(DesktopDictation, make);
